import { describe, expect, it } from "vitest";
import {
  parseReleaseReport,
  summarizeRelease,
  ReleaseReportError,
} from "../src/lib/mercadopago/report";

/**
 * Reporte de liberaciones con las columnas que documenta Mercado Pago.
 * Trae a proposito los casos que importan: un cobro, un gasto, un retiro al
 * banco (movimiento interno), una fila sin importe y una fecha ilegible.
 */
const REPORT = [
  "DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,MP_FEE_AMOUNT,INSTALLMENTS,PAYMENT_METHOD",
  "2026-03-02T10:12:33.000-03:00,111111,REF-1,payment,Venda de curso,480.50,,500.00,19.50,1,pix",
  "2026-03-03T08:00:00.000-03:00,222222,,payment,Mercado Livre - fone,,129.90,129.90,,1,credit_card",
  "2026-03-04T09:30:00.000-03:00,333333,,withdraw,Saque para conta bancaria,,1000.00,1000.00,,,bank_transfer",
  "2026-03-05T09:30:00.000-03:00,444444,,payment,Sem valor,,,,,,",
  "ayer,555555,,payment,Fecha rota,10.00,,10.00,,,",
].join("\n");

describe("parseReleaseReport", () => {
  it("lee un cobro como ingreso y le guarda la comision", () => {
    const { movements } = parseReleaseReport(REPORT);
    const income = movements.find((row) => row.sourceId === "111111");

    expect(income).toBeDefined();
    expect(income?.type).toBe("INCOME");
    expect(income?.kind).toBe("income");
    expect(income?.amount).toBe("480.50");
    expect(income?.fee).toBe("19.50");
    expect(income?.date).toBe("2026-03-02");
    expect(income?.paymentMethod).toBe("pix");
    expect(income?.reference).toBe("REF-1");
  });

  it("lee un debito como gasto", () => {
    const { movements } = parseReleaseReport(REPORT);
    const expense = movements.find((row) => row.sourceId === "222222");

    expect(expense?.type).toBe("EXPENSE");
    expect(expense?.kind).toBe("expense");
    expect(expense?.amount).toBe("129.90");
    expect(expense?.description).toBe("Mercado Livre - fone");
  });

  it("marca el retiro al banco como movimiento interno", () => {
    const { movements } = parseReleaseReport(REPORT);
    const withdraw = movements.find((row) => row.sourceId === "333333");

    // No es un gasto: esa plata ya esta contada en la cuenta bancaria.
    expect(withdraw?.kind).toBe("internal");
  });

  it("deja afuera las filas sin importe y con fecha ilegible, con el motivo", () => {
    const { movements, ignored } = parseReleaseReport(REPORT);

    expect(movements).toHaveLength(3);
    expect(ignored).toHaveLength(2);
    expect(ignored[0]?.reason).toContain("importe");
    expect(ignored[1]?.reason).toContain("fecha");
  });

  it("el identificador sale del reporte, asi el mismo movimiento da siempre la misma clave", () => {
    const first = parseReleaseReport(REPORT).movements.map((row) => row.externalId);
    const second = parseReleaseReport(REPORT).movements.map((row) => row.externalId);

    expect(first).toEqual(second);
    expect(first[0]).toBe("mp:111111:payment");
    // Y no se repite entre movimientos distintos.
    expect(new Set(first).size).toBe(first.length);
  });

  it("si un pago aparece en varias filas, cada una recibe su propia clave", () => {
    const repeated = [
      "DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT",
      "2026-04-01,999,payment,Cuota 1,100.00,",
      "2026-05-01,999,payment,Cuota 2,100.00,",
    ].join("\n");

    const ids = parseReleaseReport(repeated).movements.map((row) => row.externalId);
    expect(ids).toEqual(["mp:999:payment", "mp:999:payment:2"]);
  });

  it("entiende el importe con coma decimal y con punto de miles", () => {
    const brazilian = [
      "DATE;SOURCE_ID;RECORD_TYPE;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT",
      "01/04/2026;777;payment;Aluguel;;1.800,50",
      "02/04/2026;778;payment;Recebido;2.000,00;",
    ].join("\n");

    const { movements } = parseReleaseReport(brazilian);
    expect(movements[0]?.amount).toBe("1800.50");
    expect(movements[0]?.type).toBe("EXPENSE");
    expect(movements[0]?.date).toBe("2026-04-01");
    expect(movements[1]?.amount).toBe("2000.00");
    expect(movements[1]?.type).toBe("INCOME");
  });

  it("un bruto negativo sin columnas netas es un gasto", () => {
    const signed = [
      "DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,GROSS_AMOUNT",
      "2026-06-01,1,payment,Compra,-42.00",
      "2026-06-02,2,payment,Cobro,42.00",
    ].join("\n");

    const { movements } = parseReleaseReport(signed);
    expect(movements[0]?.type).toBe("EXPENSE");
    expect(movements[1]?.type).toBe("INCOME");
  });

  it("rechaza un archivo que no es el reporte", () => {
    expect(() => parseReleaseReport("nombre,apellido\nAgustin,Pizarro")).toThrow(ReleaseReportError);
  });

  it("rechaza un reporte sin ninguna columna de importe", () => {
    expect(() => parseReleaseReport("DATE,SOURCE_ID\n2026-01-01,1")).toThrow(ReleaseReportError);
  });
});

describe("summarizeRelease", () => {
  it("suma ingresos y gastos y deja los internos aparte", () => {
    const { movements } = parseReleaseReport(REPORT);
    const summary = summarizeRelease(movements);

    expect(summary.total).toBe(3);
    expect(summary.internal).toBe(1);
    expect(summary.income).toBe("480.50");
    expect(summary.expense).toBe("129.90");
  });
});
