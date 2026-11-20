/**
 * Traduccion de los mensajes que devuelve la API.
 *
 * Los mensajes de error del servidor (validacion de formularios, reglas de
 * negocio, fallos de importacion) se escriben en español, que es el idioma de
 * referencia del codigo. El servidor no sabe en que idioma esta mirando la
 * pantalla quien hizo el pedido, asi que la traduccion se hace al recibir la
 * respuesta, en `src/lib/client/api.ts`.
 *
 * Un mensaje que no este en esta tabla se muestra tal cual. Eso pasa con los
 * pocos que se arman con datos (un nombre de columna, un numero de fila); son
 * casos de borde de la importacion.
 */
const PT: Record<string, string> = {
  "Agregá al menos una linea.": "Adicione pelo menos uma linha.",
  "Correo invalido.": "E-mail inválido.",
  "El archivo esta vacio.": "O arquivo está vazio.",
  "El archivo no es un JSON valido.": "O arquivo não é um JSON válido.",
  "El archivo no parece una copia de JSuzuki Control.": "O arquivo não parece uma cópia do JSuzuki Control.",
  "El archivo supera los 8 MB.": "O arquivo passa de 8 MB.",
  "El color tiene que ser un hex como #64748b.": "A cor tem que ser um hex como #64748b.",
  "El color tiene que ser un hexadecimal como #10b981.": "A cor tem que ser um hexadecimal como #10b981.",
  "El correo o la contraseña no coinciden.": "O e-mail ou a senha não conferem.",
  "El cuerpo de la peticion no es JSON valido.": "O corpo do pedido não é um JSON válido.",
  "El destino tiene que ser otra cuenta.": "O destino tem que ser outra conta.",
  "El fin no puede ser anterior al inicio.": "O fim não pode ser anterior ao início.",
  "El importe es demasiado grande.": "O valor é grande demais.",
  "El importe no puede ser negativo.": "O valor não pode ser negativo.",
  "El importe tiene que ser mayor que cero.": "O valor tem que ser maior que zero.",
  "El movimiento esta en la papelera. Restauralo antes de editarlo.":
    "O lançamento está na lixeira. Restaure antes de editar.",
  "El porcentaje no puede pasar de 100.": "A porcentagem não pode passar de 100.",
  "El porcentaje no puede ser negativo.": "A porcentagem não pode ser negativa.",
  "El registro esta referenciado por otros datos.": "O registro está sendo usado por outros dados.",
  "El registro está cerrado en esta instalación.": "O cadastro está fechado nesta instalação.",
  "El registro no existe.": "O registro não existe.",
  "Elegi el dia de la semana.": "Escolha o dia da semana.",
  "Elegi el dia del mes.": "Escolha o dia do mês.",
  "Elegi la cuenta de destino.": "Escolha a conta de destino.",
  "Elegi la cuenta de origen.": "Escolha a conta de origem.",
  "Elegi si el gasto es fijo, variable o extraordinario.":
    "Escolha se a despesa é fixa, variável ou extraordinária.",
  "Error interno del servidor.": "Erro interno do servidor.",
  "Esa cuenta no existe.": "Essa conta não existe.",
  "Escribí tu contraseña actual.": "Escreva a sua senha atual.",
  "Escribí tu contraseña.": "Escreva a sua senha.",
  "Escribí tu nombre.": "Escreva o seu nome.",
  "Ese informe no existe.": "Esse relatório não existe.",
  "Ese lote no existe.": "Esse lote não existe.",
  "Ese movimiento no existe.": "Esse lançamento não existe.",
  "Este campo es obligatorio.": "Este campo é obrigatório.",
  "Este movimiento es el pago de una cuota. Editalo desde la deuda para que el saldo quede bien.":
    "Este lançamento é o pagamento de uma parcela. Edite pela dívida para o saldo ficar certo.",
  "Este movimiento es un aporte a un objetivo de ahorro. Editalo desde el objetivo.":
    "Este lançamento é um aporte a um objetivo de poupança. Edite pelo objetivo.",
  "Fallo la consulta a Mercado Pago.": "A consulta ao Mercado Pago falhou.",
  "Falta decir con cual de tus movimientos es el mismo.": "Falta dizer com qual dos seus lançamentos ele coincide.",
  "Falta decir cual es la columna de la fecha.": "Falta dizer qual é a coluna da data.",
  "Falta decir cual es la columna del importe.": "Falta dizer qual é a coluna do valor.",
  "Falta el archivo.": "Falta o arquivo.",
  "Faltan las opciones de importacion.": "Faltam as opções de importação.",
  "Formato no soportado. Subi un archivo .csv o .xlsx.": "Formato não aceito. Envie um arquivo .csv ou .xlsx.",
  "Formato no valido. Usa csv, xlsx o pdf.": "Formato inválido. Use csv, xlsx ou pdf.",
  "Hay datos invalidos en el formulario.": "Há dados inválidos no formulário.",
  "Hay un filtro con un valor invalido.": "Há um filtro com um valor inválido.",
  "Identificador invalido.": "Identificador inválido.",
  "Importe invalido.": "Valor inválido.",
  "La autorizacion de Mercado Pago vencio y no hay con que renovarla. Hay que volver a conectar la cuenta.":
    "A autorização do Mercado Pago venceu e não há como renovar. É preciso conectar a conta de novo.",
  "La categoria no corresponde al tipo de movimiento.": "A categoria não corresponde ao tipo de lançamento.",
  "La contraseña actual no es correcta.": "A senha atual não está correta.",
  "La contraseña necesita mayúscula, minúscula y número.": "A senha precisa de maiúscula, minúscula e número.",
  "La fecha de inicio es posterior a la de fin.": "A data de início é posterior à de fim.",
  "La fecha de inicio no puede ser posterior a la de fin.": "A data de início não pode ser posterior à de fim.",
  "La fecha tiene que tener el formato YYYY-MM-DD.": "A data tem que estar no formato YYYY-MM-DD.",
  "La planilla no tiene filas.": "A planilha não tem linhas.",
  "La planilla no tiene hojas.": "A planilha não tem abas.",
  "La tarea periodica no esta configurada.": "A tarefa periódica não está configurada.",
  "Los porcentajes no pueden sumar mas de 100.": "As porcentagens não podem somar mais de 100.",
  "Mercado Pago acepto el pedido del reporte pero todavia no lo dejo listo. Proba de nuevo en unos minutos.":
    "O Mercado Pago aceitou o pedido do relatório mas ainda não o deixou pronto. Tente de novo em alguns minutos.",
  "Mercado Pago no devolvio el token.": "O Mercado Pago não devolveu o token.",
  "Mercado Pago no esta configurado en el servidor: faltan MERCADOPAGO_CLIENT_ID y MERCADOPAGO_CLIENT_SECRET.":
    "O Mercado Pago não está configurado no servidor: faltam MERCADOPAGO_CLIENT_ID e MERCADOPAGO_CLIENT_SECRET.",
  "Mínimo 10 caracteres.": "Mínimo de 10 caracteres.",
  "Necesitas iniciar sesion.": "Você precisa entrar na sua conta.",
  "No autorizado.": "Não autorizado.",
  "No se pudo completar la operacion.": "Não foi possível completar a operação.",
  "No se pudo conectar. Proba de nuevo.": "Não foi possível conectar. Tente de novo.",
  "No hay ninguna fila para importar.": "Não há nenhuma linha para importar.",
  "No se encontro el usuario.": "Usuário não encontrado.",
  "No se pudieron leer los permisos guardados de Mercado Pago. Desconectá la cuenta y volvé a conectarla.":
    "Não foi possível ler as permissões salvas do Mercado Pago. Desconecte a conta e conecte de novo.",
  "No se pudo abrir la planilla. Puede estar danada.": "Não foi possível abrir a planilha. Pode estar danificada.",
  "No se pudo leer el archivo enviado.": "Não foi possível ler o arquivo enviado.",
  "Para restaurar hay que confirmar que se reemplazan los datos actuales.":
    "Para restaurar é preciso confirmar que os dados atuais serão substituídos.",
  "Solo una transferencia tiene cuenta de destino.": "Só uma transferência tem conta de destino.",
  "Tiene que quedar al menos una cuenta activa.": "Tem que ficar pelo menos uma conta ativa.",
  "Todavia no conectaste tu cuenta de Mercado Pago.": "Você ainda não conectou a sua conta do Mercado Pago.",
  "Un ingreso no se clasifica como gasto.": "Uma receita não se classifica como despesa.",
  "Un periodo personalizado necesita las dos fechas.": "Um período personalizado precisa das duas datas.",
  "Una transferencia entre cuentas propias no lleva categoria.":
    "Uma transferência entre contas próprias não leva categoria.",
  "Ya existe un registro con esos datos.": "Já existe um registro com esses dados.",
  "Ya existe una cuenta con ese correo.": "Já existe uma conta com esse e-mail.",
};

/** Traduce un mensaje de la API. Si no esta en la tabla, lo devuelve igual. */
export function translateServerMessage(message: string, locale: string): string {
  if (locale !== "pt") return message;
  return PT[message] ?? message;
}

/** Lo mismo para el mapa de errores por campo que devuelve la API. */
export function translateFields(
  fields: Record<string, string> | undefined,
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(fields ?? {})) {
    out[field] = translateServerMessage(message, locale);
  }
  return out;
}
