tool = {
    name = "concat",
    description = "Concatenate array items",
    parameters = [[{"type":"object","properties":{"items":{"type":"array"}},"required":["items"]}]],
    claims = {}
}

function execute(args)
    return table.concat(args.items, ",")
end
