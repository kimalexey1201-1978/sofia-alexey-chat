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

export function buildChatRequestMessages(systemMessage, chat, limit = 30) {
  if (!systemMessage || typeof systemMessage !== "object" || Array.isArray(systemMessage)) {
    throw new TypeError("systemMessage must be an object");
  }
  if (!Array.isArray(chat)) {
    throw new TypeError("chat must be an array");
  }
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError("limit must be a positive safe integer");
  }

  return [
    { role: "system", content: String(systemMessage.content ?? "") },
    ...chat.slice(-limit).map(message => ({
      role: message.who === "me" ? "user" : "assistant",
      content: message.text
    }))
  ];
}
