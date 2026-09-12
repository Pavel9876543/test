const ALLOWED_ORIGIN = "https://pavel9876543.github.io";

function json(body: unknown, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    },
  });
}

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export default async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  if (req.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Метод не поддерживается" }, 405);
  }

  if (origin !== ALLOWED_ORIGIN) {
    return json({ ok: false, error: "Недопустимый источник запроса" }, 403);
  }

  const token = Netlify.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Netlify.env.get("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    console.error("Telegram environment variables are not configured");
    return json({ ok: false, error: "Сервис отправки временно не настроен" }, 503);
  }

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return json({ ok: false, error: "Некорректные данные" }, 400);
  }

  // Honeypot: обычный пользователь это поле не видит и не заполняет.
  if (clean(data.company, 100)) {
    return json({ ok: true });
  }

  const name = clean(data.name, 100);
  const phone = clean(data.phone, 40);
  const email = clean(data.email, 120);
  const course = clean(data.course, 100);
  const preferredContact = clean(data.preferred_contact, 50);
  const comment = clean(data.comment, 1000);
  const consent = data.consent === true || data.consent === "Да";

  if (name.length < 2 || !phone || !course || !consent) {
    return json({ ok: false, error: "Заполните обязательные поля" }, 400);
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Некорректный email" }, 400);
  }

  const text = [
    "📝 Новая регистрация на курс",
    "",
    `👤 Имя: ${name}`,
    `📞 Телефон: ${phone}`,
    `✉️ Email: ${email || "не указан"}`,
    `📚 Курс: ${course}`,
    `💬 Способ связи: ${preferredContact || "не указан"}`,
    `🗒 Комментарий: ${comment || "нет"}`,
    "✅ Согласие на обработку данных: да",
  ].join("\n");

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!telegramResponse.ok) {
      const details = await telegramResponse.text();
      console.error("Telegram API error:", telegramResponse.status, details);
      return json({ ok: false, error: "Не удалось отправить заявку администратору" }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Telegram request failed:", error);
    return json({ ok: false, error: "Ошибка связи с сервисом уведомлений" }, 502);
  }
};

export const config = {
  path: "/api/course-registration",
};
