const DEFAULT_ERROR_MESSAGE = "Не удалось получить ответ. Проверь соединение и попробуй ещё раз.";

export function applyAssistantResult(chat, result, date = new Date().toISOString()) {
  if (!Array.isArray(chat)) {
    throw new TypeError("chat must be an array");
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("result must be an object");
  }

  if (result.ok === true) {
    if (typeof result.answer !== "string" || !result.answer.trim()) {
      return {
        chat,
        status: "error",
        message: DEFAULT_ERROR_MESSAGE
      };
    }

    return {
      chat: [...chat, { who: "sofia", text: result.answer, date }],
      status: "connected",
      message: "София на связи"
    };
  }

  const message =
    typeof result.message === "string" && result.message.trim()
      ? result.message
      : DEFAULT_ERROR_MESSAGE;

  return {
    chat,
    status: "error",
    message
  };
}
