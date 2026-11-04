"""MongoDB access helpers."""
from django.conf import settings

from pymongo import MongoClient


def get_collection(name: str):
    """Return a MongoDB collection, constructing a fresh client per call."""
    if not settings.MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not configured")
    client = MongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]
    return client, db[name]
