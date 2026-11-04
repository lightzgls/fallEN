# Dot-source this in any terminal that calls seed or local tooling.
$env:GCLOUD_PROJECT = 'demo-fallen'
$env:GOOGLE_CLOUD_PROJECT = 'demo-fallen'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
$env:STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9199'
$env:FIREBASE_CONFIG = '{"projectId":"demo-fallen","storageBucket":"demo-fallen.firebasestorage.app"}'
if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath 'C:\Program Files\Android\Android Studio\jbr\bin\java.exe')) {
  $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
}
if ($env:JAVA_HOME) { $env:PATH = "$env:JAVA_HOME\bin;$env:PATH" }
