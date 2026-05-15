import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#06251f",
        tabBarInactiveTintColor: "#9bb2d2",
        tabBarActiveBackgroundColor: "#5eead4",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          height: 74,
          paddingTop: 8,
          paddingBottom: 10,
          paddingHorizontal: 8,
          borderTopWidth: 0,
          backgroundColor: isDark ? "#081a30" : "#081a30",
          shadowColor: "#061121",
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -3 },
          elevation: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
        tabBarItemStyle: {
          marginHorizontal: 4,
          marginTop: 4,
          marginBottom: 4,
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,0.10)",
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="camera.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Collection",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="books.vertical.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
