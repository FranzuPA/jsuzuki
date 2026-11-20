import { describe, expect, it } from "vitest";
import {
  detectDateOrder,
  detectDelimiter,
  parseAmount,
  parseCsv,
  parseDate,
  suggestMapping,
} from "../src/lib/import/parse";

describe("parseAmount", () => {
  it("lee el formato brasileno y argentino: punto de miles, coma decimal", () => {
    expect(parseAmount("1.234,56")?.toFixed(2)).toBe("1234.56");
    expect(parseAmount("R$ 1.800,00")?.toFixed(2)).toBe("1800.00");
    expect(parseAmount("12.345.678,90")?.toFixed(2)).toBe("12345678.90");
  });

  it("lee el formato ingles: coma de miles, punto decimal", () => {
    expect(parseAmount("1,234.56")?.toFixed(2)).toBe("1234.56");
    expect(parseAmount("$1,000.00")?.toFixed(2)).toBe("1000.00");
  });

  it("trata un separador unico con tres digitos como miles, no como decimales", () => {
    expect(parseAmount("1.500")?.toFixed(2)).toBe("1500.00");
    expect(parseAmount("1,500")?.toFixed(2)).toBe("1500.00");
    expect(parseAmount("25.000")?.toFixed(2)).toBe("25000.00");
  });

  it("trata un separador unico con dos digitos como decimales", () => {
    expect(parseAmount("1,50")?.toFixed(2)).toBe("1.50");
    expect(parseAmount("1.50")?.toFixed(2)).toBe("1.50");
    expect(parseAmount("0,99")?.toFixed(2)).toBe("0.99");
  });

  it("entiende los negativos con signo y con parentesis", () => {
    expect(parseAmount("-1.800,00")?.toFixed(2)).toBe("-1800.00");
    expect(parseAmount("(1.800,00)")?.toFixed(2)).toBe("-1800.00");
    expect(parseAmount("- R$ 250,00")?.toFixed(2)).toBe("-250.00");
  });

  it("no pierde centavos", () => {
    expect(parseAmount("0,01")?.toFixed(2)).toBe("0.01");
    expect(parseAmount("1234567,89")?.toFixed(2)).toBe("1234567.89");
  });

  it("ante tres digitos a la derecha elige miles, que es lo que usa un extracto", () => {
    // Ninguna moneda de uso diario tiene tres decimales, asi que "100,000"
    // es cien mil y no cien. Equivocarse aca cambia el importe por mil.
    expect(parseAmount("100,000")?.toFixed(2)).toBe("100000.00");
    expect(parseAmount("100.000")?.toFixed(2)).toBe("100000.00");
  });

  it("devuelve null cuando no es un numero", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("pendiente")).toBeNull();
    expect(parseAmount("1-2")).toBeNull();
    expect(parseAmount(",")).toBeNull();
  });
});

describe("parseDate", () => {
  it("lee ISO", () => {
    expect(parseDate("2026-11-15")?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(parseDate("2026-11-15T13:45:00Z")?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("lee dia primero por defecto", () => {
    expect(parseDate("03/04/2026")?.toISOString()).toBe("2026-04-03T00:00:00.000Z");
    expect(parseDate("03-04-2026")?.toISOString()).toBe("2026-04-03T00:00:00.000Z");
    expect(parseDate("03.04.2026")?.toISOString()).toBe("2026-04-03T00:00:00.000Z");
  });

  it("respeta el orden mes primero cuando se lo piden", () => {
    expect(parseDate("03/04/2026", "mdy")?.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });

  it("resuelve solo los casos sin ambiguedad", () => {
    expect(parseDate("25/12/2026", "mdy")?.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(parseDate("12/25/2026", "dmy")?.toISOString()).toBe("2026-12-25T00:00:00.000Z");
  });

  it("completa el ano de dos digitos", () => {
    expect(parseDate("15/11/26")?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(parseDate("15/11/99")?.toISOString()).toBe("1999-11-15T00:00:00.000Z");
  });

  it("lee el numero de serie de Excel", () => {
    expect(parseDate("46341")?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("rechaza fechas que no existen", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("00/01/2026")).toBeNull();
    expect(parseDate("mañana")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("elige dia primero cuando alguna fila pasa de 12 en el primer numero", () => {
    expect(detectDateOrder(["03/04/2026", "25/04/2026", "01/05/2026"])).toBe("dmy");
  });

  it("elige mes primero cuando el segundo numero pasa de 12", () => {
    expect(detectDateOrder(["04/25/2026", "05/01/2026"])).toBe("mdy");
  });

  it("ante la duda usa dia primero", () => {
    expect(detectDateOrder(["03/04/2026", "05/06/2026"])).toBe("dmy");
  });
});

describe("parseCsv", () => {
  it("detecta el separador", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });

  it("respeta las comillas, las comas adentro y las comillas dobles", () => {
    const data = parseCsv('fecha,descripcion,importe\n2026-11-15,"Super, el grande","1.234,56"\n');
    expect(data.headers).toEqual(["fecha", "descripcion", "importe"]);
    expect(data.rows).toEqual([["2026-11-15", "Super, el grande", "1.234,56"]]);

    const quoted = parseCsv('a,b\n"dice ""hola""",2\n');
    expect(quoted.rows[0]?.[0]).toBe('dice "hola"');
  });

  it("acepta saltos de linea dentro de un campo entrecomillado", () => {
    const data = parseCsv('a,b\n"linea 1\nlinea 2",2\n');
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]?.[0]).toBe("linea 1\nlinea 2");
  });

  it("saca el BOM y las filas vacias", () => {
    const data = parseCsv("﻿a,b\n1,2\n\n\n3,4\n");
    expect(data.headers).toEqual(["a", "b"]);
    expect(data.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("empareja el ancho de las filas cortas", () => {
    const data = parseCsv("a,b,c\n1,2\n");
    expect(data.rows[0]).toEqual(["1", "2", ""]);
  });

  it("falla con un archivo vacio", () => {
    expect(() => parseCsv("   \n\n")).toThrow();
  });
});

describe("suggestMapping", () => {
  it("reconoce los encabezados en espanol", () => {
    const data = parseCsv("Fecha,Descripcion,Importe,Categoria\n2026-11-15,Super,100,Alimentacion\n");
    expect(suggestMapping(data)).toMatchObject({ date: 0, description: 1, amount: 2, category: 3 });
  });

  it("reconoce los encabezados en portugues", () => {
    const data = parseCsv("Data,Histórico,Valor\n15/11/2026,Mercado,100\n");
    expect(suggestMapping(data)).toMatchObject({ date: 0, description: 1, amount: 2 });
  });

  it("reconoce las columnas separadas de entrada y salida", () => {
    const data = parseCsv("Data,Descricao,Credito,Debito\n15/11/2026,Salario,4500,\n");
    const mapping = suggestMapping(data);
    expect(mapping.income).toBe(2);
    expect(mapping.expense).toBe(3);
    expect(mapping.amount).toBeUndefined();
  });

  it("adivina por el contenido cuando los encabezados no dicen nada", () => {
    const data = parseCsv("col1,col2,col3\n15/11/2026,Compra en el super,1.234,56\n16/11/2026,Nafta,200\n");
    const mapping = suggestMapping(data);
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
  });

  it("no asigna dos veces la misma columna", () => {
    const data = parseCsv("Fecha,Valor,Valor\n2026-11-15,100,200\n");
    const mapping = suggestMapping(data);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });
});
