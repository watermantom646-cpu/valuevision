import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#CBFF62",
        tabBarInactiveTintColor: "#8DA59B",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          height: 76,
          paddingTop: 7,
          paddingBottom: 9,
          paddingHorizontal: 9,
          borderTopWidth: 1,
          borderTopColor: "rgba(246,241,230,0.10)",
          backgroundColor: "#081C16",
          shadowColor: "#000000",
          shadowOpacity: 0.24,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -5 },
          elevation: 9,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
          letterSpacing: 0.2,
        },
        tabBarItemStyle: {
          marginHorizontal: 4,
          marginTop: 4,
          marginBottom: 4,
          borderRadius: 16,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={25} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Value",
          tabBarIcon: ({ color }) => <IconSymbol size={25} name="camera.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Saved",
          tabBarIcon: ({ color }) => <IconSymbol size={25} name="books.vertical.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="sell" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="scan-flow" options={{ href: null }} />
    </Tabs>
  );
}
