import { Image, StyleSheet, Text, View } from "react-native";
import type { SwapAsset } from "@/security/mainnet-swap-policy";
export function MainnetSwapAssetIcon({ asset }: { asset: SwapAsset }) {
  return asset === "arxi" ? (
    <Image source={require("../assets/logo-ARXI.jpg")} style={styles.icon} />
  ) : (
    <View
      style={[
        styles.icon,
        styles.center,
        { backgroundColor: asset === "usdt" ? "#22A17D" : "#F0B90B" },
      ]}
    >
      <Text style={styles.letter}>{asset === "usdt" ? "₮" : "◆"}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  icon: { height: 28, width: 28, borderRadius: 14 },
  center: { alignItems: "center", justifyContent: "center" },
  letter: { color: "#FFF", fontSize: 21, fontWeight: "800" },
});
