import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Picker } from "@react-native-picker/picker";

const GenreForm = (props) =>{
  const { showModal, setShowModal } = props;
  const [selectedGenre, setSelectedGenre] = useState("");
  const [customGenre, setCustomGenre] = useState("");

  const handleGenreChange = (value) => {
    setSelectedGenre(value);
  };

  const handleCustomGenreChange = (value) => {
    setCustomGenre(value);
  };

  return (
    <View style={{ display: showModal ? "block" : "none" }}>
      <Text>Select a genre:</Text>
      <Picker selectedValue={selectedGenre} onValueChange={handleGenreChange}>
        <Picker.Item label="Rap" value="rap" />
        <Picker.Item label="Pop" value="pop" />
        <Picker.Item label="Rock" value="rock" />
        <Picker.Item label="Custom" value="custom" />
      </Picker>
      {selectedGenre === "custom" && (
        <TextInput
          placeholder="Enter custom genre"
          value={customGenre}
          onChangeText={handleCustomGenreChange}
        />
      )}
    </View>
  );
};

export default GenreForm;
