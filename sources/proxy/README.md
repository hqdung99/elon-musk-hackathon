# Shopee proxy (Python Azure Functions)

Standalone backend equivalent of [Musk's Vite proxy](../musk/vite.config.ts).
Musk is unchanged. Uses the Python v2 programming model and Functions runtime v4.

- `/shopee-api/<path>?<query>` forwards to `https://shopee.vn/api/<path>?<query>`.
  There is no extra `/api` prefix on the Function URL.
- Forwards methods, request bodies, query strings, upstream status codes (including
  errors), response bodies and end-to-end headers. Redirects are returned, not followed.
- The same five `SHOPEE_PROXY_*` settings override client headers server-side.
  All empty is allowed, like Vite; partial configuration fails startup and names
  only the missing settings. Real authenticated Shopee calls need all five.
- Transport headers are removed. Azure authorization headers and the reserved
  `code` query parameter are never sent to Shopee. Compressed upstream responses
  are decoded. `Set-Cookie` is deliberately omitted so Shopee cookies cannot be
  installed on the proxy's domain; refresh the server-side captured session instead.
- Connection/read timeouts are 5/30 seconds. Network failures return JSON 502;
  timeouts return JSON 504. Upstream HTTP failures are passed through, not replaced
  with fixture data. Requests and responses are buffered, not streamed.

## Local development

Install Python 3.12 and Azure Functions Core Tools v4. Python Functions are hosted
on Linux in Azure; for local development on Windows, use WSL2 or a Linux dev
container with Python and Core Tools installed.

From the repository root in PowerShell:

```powershell
cd sources\proxy
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item local.settings.example.json local.settings.json
python -m unittest discover -s tests -v
```

Fill the five header settings in the ignored `local.settings.json`, using the
same captured values as Musk's ignored `.env.local`. Do not use `VITE_` prefixes
or commit credentials. The app does not read Musk's environment files.
`AzureWebJobsStorage` can remain empty for local HTTP-only use; if your local host
requires storage, run Azurite and set it to `UseDevelopmentStorage=true`.

Inside your Linux development environment, install requirements into its own
virtual environment and run:

```sh
func start
```

Core Tools normally disables function-key checks locally:

```powershell
curl.exe "http://localhost:7071/shopee-api/v4/search/search_items?keyword=iphone%2017&limit=10"
```

Do not expose the local host publicly.

## Deploy to Azure

1. Create a **Linux Function App** with **Python 3.12**, Functions **v4**, and a
   linked storage account, using the Azure portal or your existing infrastructure.
2. In **Settings > Environment variables**, add all five `SHOPEE_PROXY_*` values
   from [the settings template](local.settings.example.json). Keep the app's
   generated storage/runtime settings. Use Key Vault references for secrets where
   possible. Restart the app after changing the captured session.
3. Package and deploy using the ZIP deployment instructions below.
   Local settings are excluded from the ZIP; configure secrets separately.
4. In **Functions > shopee_proxy > Function keys**, obtain a function-specific key
   (not the master key). Call the HTTPS endpoint with `x-functions-key`:

   ```powershell
   $headers = @{ "x-functions-key" = $env:SHOPEE_FUNCTION_KEY }
   Invoke-RestMethod `
     -Uri "https://<FUNCTION_APP_NAME>.azurewebsites.net/shopee-api/v4/search/search_items?keyword=iphone&limit=10" `
     -Headers $headers
   ```

### ZIP deployment from Windows

Install the current Azure CLI. Python and Core Tools are not needed locally to
package and deploy; Azure builds the Linux Python dependencies remotely.

From the repository root in PowerShell:

```powershell
.\sources\proxy\package.ps1

az login
$resourceGroup = "<RESOURCE_GROUP>"
$appName = "<FUNCTION_APP_NAME>"
```

The generated `sources\proxy\proxy.zip` contains exactly `function_app.py`,
`host.json`, and `requirements.txt` at its root, not inside a `proxy` folder.
It excludes credentials, tests, caches, virtual environments, and local packages.
Re-run the script after changing the backend. An optional `-OutputPath` parameter
changes the ZIP destination.

For **Linux Consumption, Elastic Premium, or Dedicated/App Service** plans,
enable remote build before deploying:

```powershell
az functionapp config appsettings set `
  --resource-group $resourceGroup --name $appName `
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true ENABLE_ORYX_BUILD=true

az functionapp config appsettings delete `
  --resource-group $resourceGroup --name $appName `
  --setting-names WEBSITE_RUN_FROM_PACKAGE
```

For **Flex Consumption**, skip those app-setting commands. Remote build is
requested by the deployment command itself; do not set `WEBSITE_RUN_FROM_PACKAGE`.

Deploy the ZIP on either plan:

```powershell
az functionapp deployment source config-zip `
  --resource-group $resourceGroup `
  --name $appName `
  --src ".\sources\proxy\proxy.zip" `
  --build-remote true
```

Check that deployment/build completes successfully and `shopee_proxy` appears
in the portal before testing the authenticated endpoint above. Also verify a
request without a key is rejected. A source-only ZIP uploaded without remote
build will not install the required Python packages.

Azure Cloud Shell can run the same CLI deployment after uploading the ZIP there.
Use the uploaded file's path for `--src`. See Microsoft's
[package deployment guide](https://learn.microsoft.com/azure/azure-functions/deployment-zip-push)
and [remote build requirements](https://learn.microsoft.com/azure/azure-functions/functions-deployment-technologies#remote-build).

## Connect a deployed frontend

Musk currently requests relative `/shopee-api/` URLs. Configure your trusted
frontend gateway (for example Azure API Management or a server-side reverse
proxy) to forward that prefix unchanged to this Function App and inject the
function key **server-side**. Authenticate and authorize users at the gateway.
Musk needs no code changes with this same-origin setup.

Do not embed a function key in `VITE_` variables or a browser build. If a separately
authenticated client calls the function cross-origin, configure the exact allowed
frontend origins in Azure's **CORS** settings; CORS is not authentication.

**This proxy can clear and modify the real cart of the configured Shopee account.**
A function key is a shared secret, not per-user authorization. Restrict Function
App network access to your trusted gateway for shared/production deployments.
Shopee may reject Azure datacenter traffic or expired captured headers; deploying
this proxy does not bypass upstream session or anti-bot checks.

## Tests

```powershell
python -m unittest discover -s tests -v
```

Tests use a local fake upstream and mocked transport failures. They do not contact
Shopee or require real credentials. Function-key enforcement and hosted routing
belong to the Azure Functions host; verify the deployed endpoint rejects calls
without a key before exposing it.
