local logger     = require("logger")
local millennium = require("millennium")
local http       = require("http")
local json       = require("json")

local ALLOWED_HOSTS = {
  ["store.steampowered.com"]    = true,
  ["www.applegamingwiki.com"]   = true,
  ["raw.githubusercontent.com"] = true,
  ["www.protondb.com"]          = true,
}

local USER_AGENT = "mapc-compat (+https://github.com/dxoraxs/mapc-compat)"

-- Accepts a table { url = "..." } (frontend callable) or a plain string.
---@return string
function FetchUrl(args)
  local url = type(args) == "table" and args.url or args
  if type(url) ~= "string" then
    return json.encode({ ok = false, error = "url missing" })
  end

  local host = url:match("^https://([^/]+)/")
  if not host or not ALLOWED_HOSTS[host] then
    return json.encode({ ok = false, error = "host not allowed" })
  end

  local ok, res, err = pcall(http.get, url, { timeout = 20, headers = { ["User-Agent"] = USER_AGENT } })
  if not ok then
    logger:info("[mapc-compat] FetchUrl threw: " .. tostring(res))
    return json.encode({ ok = false, error = tostring(res) })
  end
  if not res then
    logger:info("[mapc-compat] FetchUrl failed: " .. tostring(err))
    return json.encode({ ok = false, error = tostring(err) })
  end
  return json.encode({ ok = true, status = res.status, body = res.body or "" })
end

local function on_load()
  logger:info("[mapc-compat] backend loaded, Millennium " .. millennium.version())
  millennium.ready()
end

local function on_frontend_loaded()
  logger:info("[mapc-compat] frontend loaded")
end

return { on_load = on_load, on_frontend_loaded = on_frontend_loaded, on_unload = function() end }
