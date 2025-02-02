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

// Map day names to moment's ISO weekdays
const dayMap = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
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

// Format lessons for display
function formatLessons(lessons) {
    return lessons
        .map(
            (l) =>
                `🕒 ${l.time} - ${l.name} (${l.professor})\n   📍 Room: ${l.room}`
        )
        .join("\n\n")
}

// Determine if the current week is odd or even based on the start date
function isOddWeek(date = moment()) {
    const startOfSemester = moment("2025-02-03")
    const currentWeek = date.diff(startOfSemester, "weeks") + 1
    return currentWeek % 2 !== 0
}

// Get schedule for a specific date
function getSchedule(date) {
    const dayName = date.format("dddd")
    const weekType = isOddWeek(date) ? "oddWeek" : "evenWeek"
    const daySchedule = timetable[weekType].find((d) => d.day === dayName)
    return daySchedule
        ? formatLessons(daySchedule.lessons)
        : "No lessons scheduled"
}

// Get schedule for the next week
function getNextWeekSchedule() {
    const nextWeekDate = moment().add(1, "week")
    const weekType = isOddWeek(nextWeekDate) ? "oddWeek" : "evenWeek"
    const weekTypeText = isOddWeek(nextWeekDate) ? "Odd Week" : "Even Week"
    const weeklySchedule = timetable[weekType]
        .map(
            (d) =>
                `📘 *${d.day}:*\n${formatLessons(d.lessons) || "No lessons"}\n`
        )
        .join("\n")
    return `📚 *Next week's schedule (${weekTypeText})*:\n\n${weeklySchedule}`
}

// Notifications checker
function checkNotifications() {
    const now = moment()

    timetable.forEach((daySchedule) => {
        daySchedule.lessons.forEach((lesson) => {
            const lessonTime = moment(lesson.time, "HH:mm")
            const dayNumber = dayMap[daySchedule.day]

            // Calculate next occurrence
            let nextOccurrence = moment().isoWeekday(dayNumber).set({
                hour: lessonTime.hours(),
                minute: lessonTime.minutes(),
                second: 0,
            })

            if (nextOccurrence.isBefore(now)) {
                nextOccurrence.add(1, "week")
            }

            // Calculate notification time
            const notifyTime = nextOccurrence.clone().subtract(15, "minutes")

            if (now.isSame(notifyTime, "minute")) {
                Object.entries(userPreferences).forEach(([chatId, prefs]) => {
                    if (prefs.notifications) {
                        bot.telegram.sendMessage(
                            chatId,
                            `⏰ *Reminder*: ${lesson.name} with ${lesson.professor} starts in 15 minutes\n` +
                                `🕒 Time: ${lesson.time}\n📍 Room: ${lesson.room}`,
                            { parse_mode: "Markdown" }
                        )
                    }
                })
            }
        })
    })
}

// Define bot commands
const commands = [
    { command: "today", description: "Get today's schedule" },
    { command: "tomorrow", description: "Get tomorrow's schedule" },
    { command: "week", description: "Get the weekly schedule" },
    { command: "next_week", description: "Get next week's schedule" },
    { command: "test", description: "Test notification" },
    { command: "notifications_on", description: "Enable reminders" },
    { command: "notifications_off", description: "Disable reminders" },
]

// Set bot commands
bot.telegram.setMyCommands(commands)

// Bot commands
bot.start((ctx) => {
    ctx.reply(
        "🎉 Welcome to Timetable Bot!\n\n" +
            "🔔 Notifications are OFF by default\n\n" +
            "Available commands:\n" +
            "/today - Today's schedule\n" +
            "/tomorrow - Tomorrow's schedule\n" +
            "/week - Full week schedule\n" +
            "/next_week - Next week's schedule\n" +
            "/notifications_on - Enable reminders\n" +
            "/notifications_off - Disable reminders\n" +
            "/test - Simulate a notification",
        {
            reply_markup: {
                keyboard: [
                    [
                        { text: "Today's schedule" },
                        { text: "Tomorrow's schedule" },
                    ],
                    [
                        { text: "Weekly schedule" },
                        { text: "Next week's schedule" },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        }
    )
})

bot.command("today", (ctx) => {
    ctx.reply(`📅 *Today's schedule*:\n\n${getSchedule(moment())}`, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [{ text: "Today's schedule" }, { text: "Tomorrow's schedule" }],
                [{ text: "Weekly schedule" }, { text: "Next week's schedule" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
        },
    })
})

bot.command("tomorrow", (ctx) => {
    ctx.reply(
        `📅 *Tomorrow's schedule*:\n\n${getSchedule(moment().add(1, "day"))}`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                keyboard: [
                    [
                        { text: "Today's schedule" },
                        { text: "Tomorrow's schedule" },
                    ],
                    [
                        { text: "Weekly schedule" },
                        { text: "Next week's schedule" },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
                selective: true,
            },
        }
    )
})

bot.command("week", (ctx) => {
    const weekType = isOddWeek() ? "oddWeek" : "evenWeek"
    const weekTypeText = isOddWeek() ? "Odd Week" : "Even Week"
    const weeklySchedule = timetable[weekType]
        .map(
            (d) =>
                `📘 *${d.day}:*\n${formatLessons(d.lessons) || "No lessons"}\n`
        )
        .join("\n")
    ctx.reply(`📚 *Weekly schedule (${weekTypeText})*:\n\n${weeklySchedule}`, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [{ text: "Today's schedule" }, { text: "Tomorrow's schedule" }],
                [{ text: "Weekly schedule" }, { text: "Next week's schedule" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
        },
    })
})

bot.command("next_week", (ctx) => {
    ctx.reply(getNextWeekSchedule(), {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [{ text: "Today's schedule" }, { text: "Tomorrow's schedule" }],
                [{ text: "Weekly schedule" }, { text: "Next week's schedule" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
        },
    })
})

bot.command("notifications_on", (ctx) => {
    userPreferences[ctx.chat.id].notifications = true
    ctx.reply(
        "🔔 Notifications ENABLED\nYou will receive reminders 15 minutes before lessons"
    )
})

bot.command("notifications_off", (ctx) => {
    userPreferences[ctx.chat.id].notifications = false
    ctx.reply(
        "🔕 Notifications DISABLED\nYou will no longer receive lesson reminders"
    )
})

bot.command("test", async (ctx) => {
    const chatId = ctx.chat.id

    if (!userPreferences[chatId].notifications) {
        return ctx.reply(
            "❌ Notifications are disabled. Use /notifications_on first"
        )
    }

    // Create a test notification
    try {
        await bot.telegram.sendMessage(
            chatId,
            `⏰ *TEST NOTIFICATION*\nThis is a simulation of a lesson reminder`,
            { parse_mode: "Markdown" }
        )
        ctx.reply(
            "✅ Check your notifications! You should have received a test message"
        )
    } catch (error) {
        ctx.reply(
            "❌ Failed to send test notification. Make sure you haven't blocked the bot"
        )
    }
})

// Handle text messages from the custom keyboard
bot.hears("Today's schedule", (ctx) => {
    ctx.reply(`📅 *Today's schedule*:\n\n${getSchedule(moment())}`, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [{ text: "Today's schedule" }, { text: "Tomorrow's schedule" }],
                [{ text: "Weekly schedule" }, { text: "Next week's schedule" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
        },
    })
})

bot.hears("Tomorrow's schedule", (ctx) => {
    ctx.reply(
        `📅 *Tomorrow's schedule*:\n\n${getSchedule(moment().add(1, "day"))}`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                keyboard: [
                    [
                        { text: "Today's schedule" },
                        { text: "Tomorrow's schedule" },
                    ],
                    [
                        { text: "Weekly schedule" },
                        { text: "Next week's schedule" },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
                selective: true,
            },
        }
    )
})

bot.hears("Weekly schedule", (ctx) => {
    const weekType = isOddWeek() ? "oddWeek" : "evenWeek"
    const weekTypeText = isOddWeek() ? "Odd Week" : "Even Week"
    const weeklySchedule = timetable[weekType]
        .map(
            (d) =>
                `📘 *${d.day}:*\n${formatLessons(d.lessons) || "No lessons"}\n`
        )
        .join("\n")
    ctx.reply(`📚 *Weekly schedule (${weekTypeText})*:\n\n${weeklySchedule}`, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [{ text: "Today's schedule" }, { text: "Tomorrow's schedule" }],
                [{ text: "Weekly schedule" }, { text: "Next week's schedule" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
        },
    })
})

bot.hears("Next week's schedule", (ctx) => {
    ctx.reply(getNextWeekSchedule(), {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [{ text: "Today's schedule" }, { text: "Tomorrow's schedule" }],
                [{ text: "Weekly schedule" }, { text: "Next week's schedule" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
            selective: true,
        },
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
