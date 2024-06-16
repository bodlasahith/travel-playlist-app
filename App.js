import { Alert, View, Button, TextInput } from "react-native";
import React, { useState, useEffect } from "react";
import MapView, { Marker } from "react-native-maps";
import axios from "axios";
import * as AuthSession from "expo-auth-session";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  GOOGLE_MAPS_API_KEY,
} from "@env";

import GenreForm from "./GenreForm";

const clientId = SPOTIFY_CLIENT_ID;
const clientSecret = SPOTIFY_CLIENT_SECRET;
const redirectUri = "myapp://redirect";

const googleAPIkey = GOOGLE_MAPS_API_KEY;

const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

const App = () => {
  const [accessToken, setAccessToken] = useState("");

  const [travelTime, setTravelTime] = useState(null);
  const [destination, setDestination] = useState("");
  const [markerPosition, setMarkerPosition] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission to access location was denied");
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      setCurrentPosition({ latitude, longitude });
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    })();
  }, []);

  useEffect(() => {
    if (markerPosition) {
      setRegion({
        latitude: markerPosition.latitude,
        longitude: markerPosition.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    }
  }, [markerPosition]);

  WebBrowser.maybeCompleteAuthSession();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      redirectUri,
      scopes: [
        "user-read-email",
        "user-library-read",
        "user-read-recently-played",
        "user-top-read",
        "playlist-read-private",
        "playlist-read-collaborative",
        "playlist-modify-public",
      ],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: false,
      extraParams: {
        show_dialog: true,
      },
    },
    discovery
  );

  const getToken = async (code) => {
    const payload = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    };

    const response = await fetch(discovery.tokenEndpoint, payload).catch(
      (error) => console.error("Error:", error)
    );
    const data = await response.json();

    setAccessToken(data.access_token);
  };

  useEffect(() => {
    if (response?.type === "success") {
      const { code } = response.params;
      getToken(code);
    }
  }, [response]);

  const handleDestinationSubmit = async () => {
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${destination}&key=${googleAPIkey}`
      );

      if (response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;

        setMarkerPosition({
          latitude: location.lat,
          longitude: location.lng,
        });
      }
    } catch (error) {
      console.error("Error fetching the destination coordinates:", error);
    }
  };

  const getTravelTime = async (origin, destination) => {
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${googleAPIkey}`
      );

      if (response.data.status === "OK" && response.data.routes.length > 0) {
        const travelTime = response.data.routes[0].legs[0].duration.value; // travel time in seconds
        return travelTime;
      } else {
        console.error("Error in response from Directions API:", response.data);
        throw new Error("No routes found");
      }
    } catch (error) {
      console.error("Error fetching travel time:", error);
      throw error;
    }
  };

  const fetchSongs = async (accessToken, travelTime) => {
    try {
      const response = await fetch(
        `https://api.spotify.com/v1/recommendations?limit=50&seed_genres=rap,pop`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Spotify API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      let totalDuration = 0;
      const songs = [];

      for (const track of data.tracks) {
        totalDuration += track.duration_ms;
        songs.push(track);
        if (totalDuration >= travelTime * 1000) break; // travelTime is in seconds, convert to ms
      }

      return songs;
    } catch (error) {
      console.error("Error fetching songs:", error);
    }
  };

  const openGenreModal = () => {
    setShowModal(true);
  };

  const createPlaylist = async () => {
    const origin = `${currentPosition.latitude},${currentPosition.longitude}`;
    const destination = `${markerPosition.latitude},${markerPosition.longitude}`;

    const travelTime = await getTravelTime(origin, destination);
    setTravelTime(travelTime);

    const songs = await fetchSongs(accessToken, travelTime);

    const response = await fetch(`https://api.spotify.com/v1/me/playlists`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Travel Playlist",
        description: "Playlist curated for your trip",
        public: true,
      }),
    });

    const playlist = await response.json();

    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: songs.map((song) => song.uri),
      }),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} region={region}>
        {markerPosition && <Marker coordinate={markerPosition} />}
        {currentPosition && (
          <Marker
            coordinate={currentPosition}
            title="Your Location"
            pinColor="blue"
          />
        )}
      </MapView>
      <TextInput
        style={{
          position: "absolute",
          top: 40,
          left: 10,
          right: 10,
          backgroundColor: "white",
          padding: 10,
          borderRadius: 5,
        }}
        placeholder="Enter destination"
        value={destination}
        onChangeText={setDestination}
        onSubmitEditing={handleDestinationSubmit}
      />
      <Button
        disabled={!request}
        title="Login with Spotify"
        onPress={() => {
          promptAsync();
        }}
      />
      <Button title="Create Playlist" onPress={openGenreModal} />
      <GenreForm showModal={showModal} setShowModal={setShowModal}  />
    </View>
  );
};

export default App;
