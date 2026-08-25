import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

export type ImamMapPoint = {
  id: string;
  name: string;
  city: string;
  mosque?: string | null;
  lat: number;
  lng: number;
  distKm?: number | null;
};

type Props = {
  points: ImamMapPoint[];
  user?: { lat: number; lng: number } | null;
};

// Client-only Leaflet map of the UK with imam pins.
export default function UkImamMap({ points, user }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the map + layer group across renders so we can update markers only.
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      if (!mapRef.current) {
        const map = L.map(ref.current, {
          center: [54.5, -2.5], // UK centre
          zoom: 5,
          scrollWheelZoom: false,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 18,
        }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }

      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      const bounds: [number, number][] = [];

      // Default Leaflet marker icon (fix the missing image path when bundled).
      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      for (const p of points) {
        const m = L.marker([p.lat, p.lng], { icon }).bindPopup(
          `<strong>${escapeHtml(p.name)}</strong><br/>${escapeHtml(p.mosque ?? "")}${p.mosque ? "<br/>" : ""}${escapeHtml(p.city)}${p.distKm != null ? `<br/>${p.distKm.toFixed(1)} km away` : ""}`,
        );
        m.addTo(layer);
        bounds.push([p.lat, p.lng]);
      }

      if (user) {
        const you = L.circleMarker([user.lat, user.lng], {
          radius: 8,
          color: "#0f5132",
          weight: 3,
          fillColor: "#10b981",
          fillOpacity: 0.9,
        }).bindPopup("You");
        you.addTo(layer);
        bounds.push([user.lat, user.lng]);
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
      } else {
        map.setView([54.5, -2.5], 5);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, user]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  return <div ref={ref} className="h-[420px] w-full rounded-xl border border-border" />;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
