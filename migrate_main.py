import re
import os

filepath = 'packages/api_bridge/app/main.py'
with open(filepath, 'r') as f:
    text = f.read()

# 1. Imports
text = text.replace('get_project_by_api_key,', 'get_client_by_api_key,\n    create_client, list_clients, delete_client,')

# 2. Pydantic Models for Client
client_models = """class ClientCreate(BaseModel):
    name: str

"""
text = text.replace('class ProjectCreate(BaseModel):', client_models + 'class ProjectCreate(BaseModel):')

# 3. get_current_project -> get_current_client
text = text.replace('async def get_current_project(x_api_key: Optional[str] = Header(None)) -> Optional[Dict]:', 'async def get_current_client(x_api_key: Optional[str] = Header(None)) -> Optional[Dict]:')
text = text.replace('get_project_by_api_key(x_api_key)', 'get_client_by_api_key(x_api_key)')
text = text.replace('return project', 'return client')
text = text.replace('project = get_client_by_api_key', 'client = get_client_by_api_key')

# 4. /api/clients endpoints
clients_api = """@app.get("/api/clients")
def api_list_clients():
    return {"clients": list_clients()}

@app.post("/api/clients")
def api_create_client(body: ClientCreate):
    client = create_client(name=body.name)
    return {"client": client}

@app.delete("/api/clients/{client_id}")
def api_delete_client(client_id: str):
    delete_client(client_id)
    return {"ok": True}

"""
text = text.replace('@app.get("/api/projects")', clients_api + '@app.get("/api/projects")')

# Globally replace Depends(get_current_project) -> Depends(get_current_client)
text = text.replace('current_project: Optional[Dict] = Depends(get_current_project)', 'current_client: Optional[Dict] = Depends(get_current_client)')

# Now we have to clean up the logic in endpoints manually because regex is too complex.
# We will do that with multi_replace_file_content next.

with open(filepath, 'w') as f:
    f.write(text)

