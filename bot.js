const dotenv = require("dotenv").config()
const { Telegraf } = require("telegraf")
const moment = require("moment")
const cron = require("node-cron")
const fs = require("fs")

// Load timetable
const timetable = JSON.parse(fs.readFileSync("./timetable.json"))

// Bot setup
const bot = new Telegraf(process.env.BOT_TOKEN)
const userPreferences = {} // { [chatId]: { notifications: boolean } }
const subscribers = new Set() // Set to store chat IDs of subscribers

// Map day numbers to Romanian day names
const dayMap = {
    0: "Luni",
    1: "Marți",
    2: "Miercuri",
    3: "Joi",
    4: "Vineri",
    5: "Sâmbătă",
    6: "Duminică",
}

// Initialize user preferences middleware
bot.use((ctx, next) => {
    const chatId = ctx.chat.id
    if (!userPreferences[chatId]) {
        userPreferences[chatId] = {
            notifications: false, // Default to off
        }
    }
    next()
})

function getKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: "Orarul de azi 📅" }, { text: "Orarul de mâine 📅" }],
                [
                    { text: "Săptămâna curentă 🗓️" },
                    { text: "Săptămâna viitoare 🗓️" },
                ],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    }
}

// Format lessons for display
// Format lessons with dedicated emojis
function formatLessons(lessons) {
    return lessons
        .map((lesson) => {
            const time =
                lesson.time in timeSlots ? timeSlots[lesson.time] : lesson.time

            // Add Aula prefix for specific rooms
            const roomPrefix = ["3 - 3", "6 - 2"].includes(lesson.room)
                ? "Aula"
                : "Sala"

            return (
                `🕒 ${time}\n` +
                `📚 ${lesson.name}\n` +
                `👨🏫 ${lesson.professor}\n` +
                `🏫 ${roomPrefix}: ${lesson.room}\n\n`
            )
        })
        .join("\n")
}

// Determine if the current week is odd or even based on the start date
function isOddWeek(date = moment()) {
    const startOfSemester = moment("2025-02-03")
    const diffWeeks = date.diff(startOfSemester, "weeks")
    return diffWeeks % 2 === 0 // Even diff means odd week
}

// Get schedule for a specific date
function getSchedule(date) {
    const dayNumber = (date.day() + 6) % 7 // Convert Sunday(0)-Saturday(6) to Monday(0)-Sunday(6)
    const dayName = dayMap[dayNumber]
    console.log(
        `Date: ${date.format(
            "YYYY-MM-DD"
        )}, Day Number: ${dayNumber}, Day Name: ${dayName}`
    )
    const weekType = isOddWeek(date) ? "oddWeek" : "evenWeek"
    const daySchedule = timetable[weekType].find((d) => d.day === dayNumber)
    return daySchedule
        ? `📅 *${dayName}*:\n\n${formatLessons(daySchedule.lessons)}`
        : `📅 *${dayName}*:\n\nNu sunt perechi`
}

// Get schedule for the next week
function getNextWeekSchedule() {
    const nextWeekDate = moment().add(1, "week")
    const weekType = isOddWeek(nextWeekDate) ? "oddWeek" : "evenWeek"
    const weekTypeText = isOddWeek(nextWeekDate)
        ? "Săptămână impară"
        : "Săptămână pară"
    const weeklySchedule = timetable[weekType]
        .map(
            (d) =>
                `📘 *${dayMap[d.day]}:*\n${
                    formatLessons(d.lessons) || "Nu sunt perechi"
                }\n`
        )
        .join("\n")
    return `📚 *Orarul săptămânii viitoare (${weekTypeText})*:\n\n${weeklySchedule}`
}

// Add time slot configuration at the top
const timeSlots = {
    0: "15:15",
    1: "17:00",
    2: "18:45",
    3: "20:30",
}

// Update notification checker
function checkNotifications() {
    const now = moment()

    Object.keys(timetable).forEach((weekType) => {
        timetable[weekType].forEach((daySchedule) => {
            daySchedule.lessons.forEach((lesson) => {
                // Handle numeric time slots
                const time =
                    lesson.time in timeSlots
                        ? timeSlots[lesson.time]
                        : lesson.time

                const lessonTime = moment(time, "HH:mm")
                const dayNumber = daySchedule.day

                let nextOccurrence = moment()
                    .isoWeekday(dayNumber + 1)
                    .set({
                        hour: lessonTime.hours(),
                        minute: lessonTime.minutes(),
                        second: 0,
                    })

                if (nextOccurrence.isBefore(now)) {
                    nextOccurrence.add(1, "week")
                }

                const notifyTime = nextOccurrence
                    .clone()
                    .subtract(15, "minutes")

                if (now.isSame(notifyTime, "minute")) {
                    Object.entries(userPreferences).forEach(
                        ([chatId, prefs]) => {
                            if (prefs.notifications) {
                                bot.telegram.sendMessage(
                                    chatId,
                                    `⏰ *Reminder*:\n` +
                                        `🕒 ${time}\n` +
                                        `📚 ${lesson.name}\n` +
                                        `👨🏫 ${lesson.professor}\n` +
                                        `🏫 ${
                                            ["3 - 3", "6 - 2"].includes(
                                                lesson.room
                                            )
                                                ? "Aula"
                                                : "Sala"
                                        }: ${lesson.room}`,
                                    { parse_mode: "Markdown" }
                                )
                            }
                        }
                    )
                }
            })
        })
    })
}

// Define bot commands
const commands = [
    { command: "today", description: "Orarul de azi" },
    { command: "tomorrow", description: "Orarul de mâine" },
    { command: "week", description: "Orarul săptămânii" },
    { command: "next_week", description: "Orarul săptămânii viitoare" },
    { command: "test", description: "Test notificare" },
    { command: "notifications_on", description: "Activează notificările" },
    { command: "notifications_off", description: "Dezactivează notificările" },
]

// Set bot commands
bot.telegram.setMyCommands(commands)

// Bot commands
bot.start((ctx) => {
    ctx.reply(
        "🎉 Bine ai venit la Timetable Bot!\n\n" +
            "🔔 Notificările sunt OPRITE implicit\n\n" +
            "Comenzi disponibile:\n" +
            "/today - Orarul de azi 📅\n" +
            "/tomorrow - Orarul de mâine 📅\n" +
            "/week - Orarul săptămânii 🗓️\n" +
            "/next_week - Orarul săptămânii viitoare 🗓️\n" +
            "/notifications_on - Activează notificările 🔔\n" +
            "/notifications_off - Dezactivează notificările 🔕\n" +
            "/test - Simulează o notificare",
        {
            reply_markup: {
                keyboard: [
                    [
                        { text: "Orarul de azi 📅" },
                        { text: "Orarul de mâine 📅" },
                    ],
                    [
                        { text: "Săptămâna curentă 🗓️" },
                        { text: "Săptămâna viitoare 🗓️" },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        }
    )
})

bot.command("today", (ctx) => {
    const today = moment()
    const dayName = dayMap[today.day()]
    ctx.reply(`📅 *Orarul de azi (${dayName})*:\n\n${getSchedule(today)}`, {
        parse_mode: "Markdown",
        ...getKeyboard(),
    })
})

bot.command("tomorrow", (ctx) => {
    const tomorrow = moment().add(1, "day")
    const dayName = dayMap[tomorrow.day()]
    ctx.reply(
        `📅 *Orarul de mâine (${dayName})*:\n\n${getSchedule(tomorrow)}`,
        {
            parse_mode: "Markdown",
            ...getKeyboard(),
        }
    )
})

bot.command("week", (ctx) => {
    const weekType = isOddWeek() ? "oddWeek" : "evenWeek"
    const weekTypeText = isOddWeek() ? "Săptămână impară" : "Săptămână pară"
    const weeklySchedule = timetable[weekType]
        .map(
            (d) =>
                `📘 *${dayMap[d.day]}:*\n${
                    formatLessons(d.lessons) || "Nu sunt perechi"
                }\n`
        )
        .join("\n")
    ctx.reply(
        `📚 *Orarul săptămânii (${weekTypeText})*:\n\n${weeklySchedule}`,
        {
            parse_mode: "Markdown",
            ...getKeyboard(),
        }
    )
})

bot.command("next_week", (ctx) => {
    ctx.reply(getNextWeekSchedule(), {
        parse_mode: "Markdown",
        ...getKeyboard(),
    })
})

bot.command("notifications_on", (ctx) => {
    userPreferences[ctx.chat.id].notifications = true
    ctx.reply(
        "🔔 Notificări PORNITE\nVei primi notificări cu fiecare 15 minute înainte de pereche"
    )
})

bot.command("notifications_off", (ctx) => {
    userPreferences[ctx.chat.id].notifications = false
    ctx.reply("🔕 Notificări OPRITE\nNu vei mai primi notificări")
})

bot.command("test", async (ctx) => {
    const chatId = ctx.chat.id

    if (!userPreferences[chatId].notifications) {
        return ctx.reply(
            "❌ Notificările sunt oprite. Folosește /notifications_on mai întâi"
        )
    }

    // Create a test notification
    try {
        await bot.telegram.sendMessage(
            chatId,
            `⏰ *TEST NOTIFICATION*\nAceasta este o simulare a unei notificări de lecție`,
            { parse_mode: "Markdown" }
        )
        ctx.reply(
            "✅ Verifică notificările! Ar trebui să fi primit un mesaj de test"
        )
    } catch (error) {
        ctx.reply(
            "❌ Eșec la trimiterea notificării de test. Asigură-te că nu ai blocat botul"
        )
    }
})

// Handle text messages from the custom keyboard
bot.hears("Orarul de azi 📅", (ctx) => {
    ctx.reply(`📅 *Orarul de azi*:\n\n${getSchedule(moment())}`, {
        parse_mode: "Markdown",
        ...getKeyboard(),
    })
})

bot.hears("Orarul de mâine 📅", (ctx) => {
    ctx.reply(
        `📅 *Orarul de mâine*:\n\n${getSchedule(moment().add(1, "day"))}`,
        {
            parse_mode: "Markdown",
            ...getKeyboard(),
        }
    )
})

bot.hears("Săptămâna curentă 🗓️", (ctx) => {
    const weekType = isOddWeek() ? "oddWeek" : "evenWeek"
    const weekTypeText = isOddWeek() ? "Săptămână impară" : "Săptămână pară"
    const weeklySchedule = timetable[weekType]
        .map(
            (d) =>
                `📘 *${dayMap[d.day]}:*\n${
                    formatLessons(d.lessons) || "Nu sunt perechi"
                }\n`
        )
        .join("\n")
    ctx.reply(
        `📚 *Orarul săptămânii (${weekTypeText})*:\n\n${weeklySchedule}`,
        {
            parse_mode: "Markdown",
            ...getKeyboard(),
        }
    )
})

bot.hears("Săptămâna viitoare 🗓️", (ctx) => {
    ctx.reply(getNextWeekSchedule(), {
        parse_mode: "Markdown",
        ...getKeyboard(),
    })
})

// Schedule notification checks every minute
cron.schedule("* * * * *", checkNotifications)

// Start bot
bot.launch()
    .then(() => console.log("🚀 Bot started successfully"))
    .catch((err) => console.error("❌ Bot startup error:", err))

// Handle shutdown
process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
