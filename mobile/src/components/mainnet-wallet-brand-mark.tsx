import { Image, type ImageStyle } from "react-native";
/** The bundled project logo; rendering never fetches an external image. */
export function MainnetWalletBrandMark({
  size = 36,
  style,
}: {
  size?: number;
  style?: ImageStyle;
}) {
  return (
    <Image
      accessibilityLabel="AurionXI logo"
      source={require("../assets/logo-ARXI.jpg")}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}
