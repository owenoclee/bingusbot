tool = {
    name = "sandbox_probe",
    description = "Probe sandbox globals",
    parameters = [[{"type":"object","properties":{"globals":{"type":"array"}},"required":["globals"]}]],
    claims = {}
}

function execute(args)
    local results = {}
    for i, name in ipairs(args.globals) do
        local fn = load("return " .. name)
        local val = nil
        if fn then
            local ok, result = pcall(fn)
            if ok then val = result end
        end
        results[#results + 1] = name .. "=" .. type(val)
    end
    return table.concat(results, ",")
end
