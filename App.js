import {
  Alert,
  View,
  Button,
  TextInput,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from "react-native";
import React, { useState, useEffect, useRef } from "react";
import MapView, { Marker } from "react-native-maps";
import axios from "axios";
import * as AuthSession from "expo-auth-session";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  GOOGLE_MAPS_API_KEY,
} from "./env";

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const [isGenreModalOpen, setIsGenreModalOpen] = useState(false);
  const [genres, setGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(nameOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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
    setIsAuthenticated(true);
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
        const travelTime = response.data.routes[0].legs[0].duration.value;
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
        `https://api.spotify.com/v1/recommendations?limit=50&seed_genres=${selectedGenres.join(
          ","
        )}`,
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
        if (totalDuration >= travelTime * 1000) break;
      }

      return songs;
    } catch (error) {
      console.error("Error fetching songs:", error);
    }
  };

  const getDestinationAddress = async () => {
    try {
      const currentPositionResponse = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${currentPosition.latitude},${currentPosition.longitude}&key=${googleAPIkey}`
      );
      const markerPositionResponse = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${markerPosition.latitude},${markerPosition.longitude}&key=${googleAPIkey}`
      );
      const currentPositionAddress =
        currentPositionResponse.data.results[0].formatted_address;
      const markerPositionAddress =
        markerPositionResponse.data.results[0].formatted_address;
      return {
        currentPositionAddress,
        markerPositionAddress,
      };
    } catch (error) {
      console.error("Error fetching destination addresses:", error);
      throw error;
    }
  };

  const createPlaylist = async () => {
    const origin = `${currentPosition.latitude},${currentPosition.longitude}`;
    const destination = `${markerPosition.latitude},${markerPosition.longitude}`;

    const travelTime = await getTravelTime(origin, destination);
    setTravelTime(travelTime);

    const songs = await fetchSongs(accessToken, travelTime);

    const locationAddresses = await getDestinationAddress();

    const response = await fetch(`https://api.spotify.com/v1/me/playlists`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Travel Playlist",
        description: `Playlist curated for your trip from ${locationAddresses.currentPositionAddress} to ${locationAddresses.markerPositionAddress}`,
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

  useEffect(() => {
    const fetchGenres = async () => {
      const response = await fetch(
        "https://api.spotify.com/v1/recommendations/available-genre-seeds",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const data = await response.json();
      setGenres(data.genres);
    };

    fetchGenres();
  }, [accessToken]);

  const handleGenreChange = (genre) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter((g) => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const handleSubmit = () => {
    setSelectedGenres(selectedGenres);
    createPlaylist();
    closeGenreModal();
  };

  const closeGenreModal = () => {
    setIsGenreModalOpen(false);
  };

  const openGenreModal = () => {
    setIsGenreModalOpen(true);
  };

  const closeHelpModal = () => {
    setIsHelpModalOpen(false);
  };

  const openHelpModal = () => {
    setIsHelpModalOpen(true);
  };

  return (
    <View style={styles.view}>
      <MapView style={styles.mapView} region={region}>
        {currentPosition && (
          <Marker
            coordinate={currentPosition}
            title="Your Location"
            pinColor="blue"
          />
        )}
        {markerPosition && (
          <Marker
            coordinate={markerPosition}
            title="Destination"
            pinColor="red"
          />
        )}
      </MapView>
      <TextInput
        style={styles.textInput}
        placeholder="Enter destination"
        value={destination}
        onChangeText={setDestination}
        onSubmitEditing={handleDestinationSubmit}
      />
      {isAuthenticated ? null : (
        <View style={styles.fullScreenView}>
          <Animated.Image
            source={require("./assets/jukebox_logo.png")}
            style={[styles.logo, { opacity: logoOpacity }]}
          />
          <Animated.Text style={[styles.name, { opacity: nameOpacity }]}>
            Jukebox
          </Animated.Text>
          <Animated.Text
            style={[styles.subtitle, { opacity: subtitleOpacity }]}
          >
            Curate Your Journey
          </Animated.Text>
          <Animated.View style={{ opacity: buttonOpacity }}>
            <TouchableOpacity
              disabled={!request}
              onPress={() => {
                promptAsync();
              }}
              style={styles.loginButton}
            >
              <Text style={styles.loginButtonText}>Login with Spotify</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
      {isGenreModalOpen ? (
        <View style={styles.genreModal}>
          <Text style={styles.title}>Select Genres</Text>
          <ScrollView style={styles.scrollView}>
            {genres.map((genre) => (
              <TouchableOpacity
                key={genre}
                style={styles.genreItem}
                onPress={() => handleGenreChange(genre)}
              >
                <Text
                  style={{
                    color: selectedGenres.includes(genre) ? "blue" : "black",
                  }}
                >
                  {genre}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            disabled={!selectedGenres || selectedGenres.length === 0}
            onPress={handleSubmit}
            style={styles.button}
          >
            <Text>Create Playlist</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={closeGenreModal} style={styles.button}>
            <Text>Close</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Button
            disabled={destination.trim().length === 0}
            title="Create Playlist"
            onPress={openGenreModal}
          />
          <Button
            title="Open Help"
            onPress={openHelpModal}
          />
        </View>
      )}
      {isHelpModalOpen ? (
        <View style={styles.genreModal}>
          <Text style={styles.title}>Help</Text>
          <Text>1. Enter your destination in the search bar and press Enter.</Text>
          <Text>2. Click on Create Playlist to select genres.</Text>
          <Text>3. Select genres and click Create Playlist again.</Text>
          <Text>4. Your playlist will be created on Spotify.</Text>
          <TouchableOpacity onPress={closeHelpModal} style={styles.button}>
            <Text onClick={closeHelpModal}>Close</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  view: {
    flex: 1,
  },
  mapView: {
    flex: 1,
  },
  fullScreenView: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#191414",
  },
  logo: {
    width: 200,
    height: 300,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.3,
  },
  name: {
    color: "#FFFFFF",
    marginBottom: 20,
    fontSize: 60,
    fontWeight: "bold",
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.75)",
    textShadowRadius: 5,
  },
  subtitle: {
    color: "lightgray",
    marginBottom: 200,
    fontSize: 16,
    textAlign: "center",
  },
  loginButton: {
    backgroundColor: "#1DB954",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  textInput: {
    position: "absolute",
    top: 40,
    left: 10,
    right: 10,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 5,
  },
  genreModal: {
    padding: 20,
    backgroundColor: "white",
    borderRadius: 10,
  },
  scrollView: {
    maxHeight: 200,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
  },
  genreItem: {
    paddingVertical: 10,
  },
  button: {
    marginTop: 10,
    backgroundColor: "#ddd",
    padding: 10,
    borderRadius: 5,
  },
});

export default App;
