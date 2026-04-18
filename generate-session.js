import dotenv from "dotenv";
import input from "input";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

dotenv.config();

const apiIdRaw = process.env.TELEGRAM_API_ID;
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiIdRaw || !apiHash) {
    console.error(
        "Ошибка: не найдены TELEGRAM_API_ID и/или TELEGRAM_API_HASH в файле .env."
    );
    console.error("Добавьте эти переменные и запустите скрипт снова.");
    process.exit(1);
}

const apiId = Number(apiIdRaw);

if (!Number.isInteger(apiId) || apiId <= 0) {
    console.error("Ошибка: TELEGRAM_API_ID должен быть положительным числом.");
    process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
});

try {
    await client.start({
        phoneNumber: async () =>
            input.text("Введите номер телефона в формате +7...: "),
        password: async () => input.text("Введите пароль 2FA (если есть): "),
        phoneCode: async () => input.text("Введите код из Telegram: "),
        onError: (error) => {
            console.error("Ошибка авторизации:", error?.message || error);
        },
    });

    const stringSession = client.session.save();

    console.log("\nВаша StringSession:");
    console.log(stringSession);
    console.log(
        "\n✅ Скопируйте строку выше и добавьте её в ваш файл .env под именем TELEGRAM_SERVER_SESSION"
    );

    process.exit(0);
} catch (error) {
    console.error("Не удалось создать StringSession:", error?.message || error);
    process.exit(1);
}
