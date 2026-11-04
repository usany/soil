"""Root URL configuration."""
from django.urls import path

from core.views import BigMacIndexView, SearchFlightsView, UniversitiesView

urlpatterns = [
    path("api/universities/", UniversitiesView.as_view(), name="universities"),
    path("api/flights/search/", SearchFlightsView.as_view(), name="search-flights"),
    path("api/bigmac/index/", BigMacIndexView.as_view(), name="bigmac-index"),
]
