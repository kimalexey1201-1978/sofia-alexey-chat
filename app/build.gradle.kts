plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val uploadStoreFile = System.getenv("SOFIA_UPLOAD_STORE_FILE")
val uploadStorePassword = System.getenv("SOFIA_UPLOAD_STORE_PASSWORD")
val uploadKeyAlias = System.getenv("SOFIA_UPLOAD_KEY_ALIAS")
val uploadKeyPassword = System.getenv("SOFIA_UPLOAD_KEY_PASSWORD")
val hasReleaseSigning = listOf(
    uploadStoreFile,
    uploadStorePassword,
    uploadKeyAlias,
    uploadKeyPassword
).all { !it.isNullOrBlank() }

android {
    namespace = "com.sofia.ai.dev"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sofia.ai.dev"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        ndk {
            abiFilters += listOf("arm64-v8a")
        }
    }

    signingConfigs {
        create("releaseUpload") {
            if (hasReleaseSigning) {
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("releaseUpload")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

tasks.configureEach {
    if (name == "assembleRelease" || name == "bundleRelease") {
        doFirst {
            check(hasReleaseSigning) {
                "Release signing is not configured. Provide SOFIA_UPLOAD_STORE_FILE, SOFIA_UPLOAD_STORE_PASSWORD, SOFIA_UPLOAD_KEY_ALIAS and SOFIA_UPLOAD_KEY_PASSWORD."
            }
            check(file(uploadStoreFile!!).isFile) {
                "Release keystore file was not found at SOFIA_UPLOAD_STORE_FILE."
            }
        }
    }
}

dependencies {
    implementation("com.alphacephei:vosk-android:0.3.75@aar")
    implementation("net.java.dev.jna:jna:5.18.1@aar")
}
