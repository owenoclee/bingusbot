tool = {
    name = "http_tool",
    description = "Tool with http.get claim",
    parameters = [[{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}]],
    claims = {"http.get"}
}

function execute(args)
    local resp = http.get(args.url)
    return tostring(resp.status) .. ":" .. resp.body
end
