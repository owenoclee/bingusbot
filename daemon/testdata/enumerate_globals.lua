tool = {
    name = "enumerate_globals",
    description = "Enumerate all globals and their nested keys",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {}
}

function execute(args)
    local results = {}
    for k, v in pairs(_ENV) do
        -- Skip the tool's own globals (they vary per loaded file)
        if k == "tool" or k == "execute" then
            -- skip
        elseif type(v) == "table" and k ~= "_ENV" and k ~= "_G" then
            for k2, v2 in pairs(v) do
                results[#results + 1] = k .. "." .. k2 .. "=" .. type(v2)
            end
            results[#results + 1] = k .. "=" .. type(v)
        else
            results[#results + 1] = k .. "=" .. type(v)
        end
    end
    table.sort(results)
    return table.concat(results, "\n")
end
