tool = {
    name = "query_events",
    description = "Query logged events by time range, type, or tags. Use to review patterns, check habits, or recall past activities.",
    parameters = [[{"type":"object","properties":{"since":{"type":"string","description":"Time range: '24h', '7d', '30d', or ISO 8601 timestamp. Default: '24h'"},"text":{"type":"string","description":"Search text — case-insensitive substring match across all fields"},"type":{"type":"string","description":"Filter by event type (meal, exercise, social, etc.)"},"tags":{"type":"string","description":"Filter by tags, comma-separated (event must have ALL listed tags)"},"limit":{"type":"integer","description":"Max events to return (default 50)"}}}]],
    claims = {"log.query:events"}
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

function has_all_tags(event_tags, want_tags)
    if event_tags == nil then return false end
    local set = {}
    for i = 1, #event_tags do
        set[event_tags[i]] = true
    end
    for i = 1, #want_tags do
        if not set[want_tags[i]] then return false end
    end
    return true
end

function execute(args)
    local raw = events.query(args.since or "24h", args.text or "")
    local entries = json.decode(raw)
    if entries == nil then return "[]" end

    local filter_type = args.type or ""
    local want_tags = split(args.tags, ",")
    local limit = args.limit or 50

    local results = {}
    for i = 1, #entries do
        local e = entries[i]
        local match = true

        if filter_type ~= "" and e.type ~= filter_type then
            match = false
        end

        if #want_tags > 0 and not has_all_tags(e.tags, want_tags) then
            match = false
        end

        if match then
            results[#results + 1] = e
        end
    end

    -- Keep most recent entries up to limit
    if #results > limit then
        local trimmed = {}
        for i = #results - limit + 1, #results do
            trimmed[#trimmed + 1] = results[i]
        end
        results = trimmed
    end

    return json.encode(results)
end
