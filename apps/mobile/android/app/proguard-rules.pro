# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# Keep only app-owned classes that may be reached by reflection. React Native,
# Expo and native-module libraries publish their own consumer ProGuard rules.
-keep class com.marketplat.** { *; }

# Preserve explicitly exported React Native bridge methods without retaining
# every class in the React Native / Expo / Hermes dependency graph.
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keepclassmembers @com.google.gson.annotations.SerializedName class * { *; }
