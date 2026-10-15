"""Projects: a saved source + voice design + its renders."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_database
from ..schemas import Project, ProjectIn
from ..services.db import Database

router = APIRouter()


@router.get("/projects", response_model=list[Project])
def list_projects(database: Database = Depends(get_database)) -> list[dict]:
    return database.list_projects()


@router.post("/projects", response_model=Project, status_code=201)
def create_project(payload: ProjectIn, database: Database = Depends(get_database)) -> dict:
    return database.create_project(payload.model_dump())


@router.get("/projects/{project_id}", response_model=Project)
def get_project(project_id: str, database: Database = Depends(get_database)) -> dict:
    project = database.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Unknown project id.")
    return project


@router.put("/projects/{project_id}", response_model=Project)
def update_project(project_id: str, payload: ProjectIn, database: Database = Depends(get_database)) -> dict:
    updated = database.update_project(project_id, payload.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Unknown project id.")
    return updated


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, database: Database = Depends(get_database)) -> dict:
    if not database.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Unknown project id.")
    return {"status": "deleted", "project_id": project_id}
