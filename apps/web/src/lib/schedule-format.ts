export function formatScheduleSublabel(data: Record<string, unknown>): string {
  const scheduleType = (data.scheduleType as string) ?? "daily"

  switch (scheduleType) {
    case "minutes": {
      const interval = data.minutesInterval ?? 15
      return `Every ${interval} min`
    }
    case "hourly": {
      const minute = data.hourlyMinute ?? 0
      return `Hourly at :${String(minute).padStart(2, "0")}`
    }
    case "daily": {
      const time = (data.dailyTime as string) ?? "09:00"
      return `Daily at ${time}`
    }
    case "weekly": {
      const day = (data.weeklyDay as string) ?? "MON"
      const time = (data.weeklyDayTime as string) ?? "09:00"
      return `${day} at ${time}`
    }
    case "custom": {
      const cron = (data.cronExpression as string) ?? ""
      return cron ? `Cron: ${cron}` : "Custom cron"
    }
    default:
      return "Schedule"
  }
}
