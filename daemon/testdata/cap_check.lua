tool = {
    name = "cap_check",
    description = "Check capability globals",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {}
}

function execute(args)
    local results = {}
    results[#results + 1] = "http=" .. type(http)
    results[#results + 1] = "fs=" .. type(fs)
    return table.concat(results, ",")
end
