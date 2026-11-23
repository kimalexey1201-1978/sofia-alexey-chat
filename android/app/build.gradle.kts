plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sofia.ai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sofia.ai"
        minSdk = 29
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    signingConfigs {
        create("stable") {
            storeFile = file("sofia-release.jks")
            storePassword = System.getenv("SOFIA_STORE_PASSWORD")
            keyAlias = System.getenv("SOFIA_KEY_ALIAS")
            keyPassword = System.getenv("SOFIA_KEY_PASSWORD")
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("stable")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
}
