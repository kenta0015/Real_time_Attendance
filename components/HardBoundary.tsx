import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

type State = { error?: Error | null };
export default class HardBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // ここで例外を確実にログへ
    // eslint-disable-next-line no-console
    console.error("[HardBoundary] Caught error:", error?.message, error?.stack, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = `${this.state.error?.name || "Error"}: ${this.state.error?.message || "(no message)"}`;
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.msg}>{msg}</Text>
          <ScrollView style={styles.scroll}>
            <Text selectable style={styles.stack}>{this.state.error?.stack}</Text>
          </ScrollView>
          <Text style={styles.hint}>(App kept alive by HardBoundary)</Text>
        </View>
      );
    }
    return this.props.children as any;
  }
}

const styles = StyleSheet.create({
  wrap:{flex:1, padding:16, paddingTop:48, backgroundColor:"#fff"},
  title:{fontSize:20,fontWeight:"800",marginBottom:8},
  msg:{color:"#B00020",marginBottom:8},
  scroll:{flex:1, borderWidth:1, borderColor:"#eee", borderRadius:8, padding:8},
  stack:{fontSize:12, color:"#111"},
  hint:{marginTop:12, color:"#6B7280"},
});




