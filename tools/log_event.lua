tool = {
    name = "log_event",
    description = "Log a life event, activity, meal, or any notable occurrence. Use when the user mentions something they did, ate, felt, or experienced. Also use when the user says 'log: ...'",
    parameters = [[{"type":"object","properties":{"type":{"type":"string","description":"Category: meal, exercise, social, mood, health, work, sleep, hobby, errand, etc."},"content":{"type":"string","description":"What happened, in a concise sentence"},"tags":{"type":"string","description":"Comma-separated tags for flexible categorization (optional)"}},"required":["type","content"]}]],
    claims = {"log.append:events"}
}

function split(s, sep)
    if s == nil or s == "" then return {} end
    local parts = {}
    local pos = 1
    while pos <= #s do
        local i = string.find(s, sep, pos, true)
        if i then
            local part = string.sub(s, pos, i - 1)
            if #part > 0 then parts[#parts + 1] = part end
            pos = i + 1
        else
            local part = string.sub(s, pos)
            if #part > 0 then parts[#parts + 1] = part end
            break
        end
    end
    return parts
end

function execute(args)
    return events.append({
        type = args.type,
        content = args.content,
        tags = split(args.tags, ",")
    })
end
