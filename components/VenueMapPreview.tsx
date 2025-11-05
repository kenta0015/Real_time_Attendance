import React from "react";
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from "react-native";

type Props = {
  lat: number;
  lng: number;
  locationName?: string | null;
  height?: number;
};

export default function VenueMapPreview({ lat, lng, locationName, height = 220 }: Props) {
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

  if (Platform.OS !== "web") {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>{locationName ?? "Venue"}</Text>
        <Text style={styles.coords}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(mapsUrl)}>
          <Text style={styles.btnText}>Open in Google Maps</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const src = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  return (
    <View style={styles.webWrap}>
      <Text style={styles.title}>{locationName ?? "Venue"}</Text>
      {/* @ts-ignore – allow raw iframe on web */}
      <iframe
        src={src}
        width="100%"
        height={height}
        style={{ border: 0, borderRadius: 12 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <View style={{ height: 8 }} />
      {/* use inline style as any to avoid RN style typing on web elements */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer"
        style={
          {
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: "#111827",
            color: "white",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-block",
          } as any
        }
      >
        Open in Google Maps
      </a>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "white",
  },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  coords: { color: "#6B7280", marginBottom: 10 },
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  btnText: { color: "white", fontWeight: "600" },

  webWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "white",
  },
});




