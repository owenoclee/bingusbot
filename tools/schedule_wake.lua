tool = {
    name = "schedule_wake",
    description = "Schedule when to wake up next to check in or act on something. Only one wake can be pending at a time (overwrites previous). Min 5 minutes, max 7 days.",
    parameters = [[{"type":"object","properties":{"time":{"type":"string","description":"ISO 8601 timestamp for when to wake (e.g. 2026-02-22T09:00:00Z)"},"reason":{"type":"string","description":"Why you are waking — what to check or do"}},"required":["time","reason"]}]],
    claims = {"wake.set"}
}

function execute(args)
    return wake.set(args.time, args.reason)
end
