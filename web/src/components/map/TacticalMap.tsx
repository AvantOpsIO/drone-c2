import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MAP_CENTER,
  MAP_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MAX_NATIVE_ZOOM,
  COLORS,
} from '../../constants/tactical'
import { useUIStore } from '../../store/uiStore'
import { TrackOverlay } from './TrackOverlay'

/**
 * Tactical map container — Leaflet initialized once, never re-created.
 *
 * WHY useEffect with empty deps: Leaflet manages its own DOM subtree. React
 * should not touch it after initialization. Re-creating the map on re-render
 * would destroy tile cache, event listeners, and cause a visible flash.
 * We initialize once and communicate via Leaflet's native event API.
 */
export function TacticalMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const waypointMarkerRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const m = L.map(mapContainerRef.current, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      zoomControl: false,
      attributionControl: false,
    })

    // CyclOSM — full OSM detail (roads, paths, landuse, contours-style relief cues).
    // Good middle ground vs Carto Voyager (washed) / Dark Matter (too dim). See:
    // https://www.cyclosm.org/  ·  curated presets: https://github.com/leaflet-extras/leaflet-providers
    // For airgap: swap URL to local MBTiles or an internal WMTS endpoint.
    L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: MAP_MAX_NATIVE_ZOOM,
      detectRetina: true,
      crossOrigin: '',
    }).addTo(m)

    L.control.zoom({ position: 'bottomright' }).addTo(m)

    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution(
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, '
        + 'Tiles style by <a href="https://www.cyclosm.org" target="_blank" rel="noopener noreferrer">CyclOSM</a> '
        + 'hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noopener noreferrer">OSM France</a>',
      )
      .addTo(m)

    // Map click → set waypoint if a drone is selected.
    m.on('click', (e: L.LeafletMouseEvent) => {
      const selectedId = useUIStore.getState().selectedDroneId
      if (!selectedId) return

      useUIStore.getState().setWaypoint(e.latlng.lat, e.latlng.lng)

      // Show temporary waypoint marker using Leaflet native API — no React.
      if (waypointMarkerRef.current) {
        waypointMarkerRef.current.setLatLng(e.latlng)
      } else {
        waypointMarkerRef.current = L.circleMarker(e.latlng, {
          radius: 8,
          color: COLORS.waypoint,
          fillColor: 'transparent',
          weight: 2,
        }).addTo(m)
      }
    })

    mapRef.current = m
    setMap(m)

    return () => {
      m.remove()
      mapRef.current = null
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      <TrackOverlay map={map} />
    </div>
  )
}
