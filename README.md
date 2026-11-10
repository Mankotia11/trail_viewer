# TrailView Mobile Build Guide

## 1) One-time setup

```bash
cd mobile
npm install
npm install -g eas-cli
eas login
```

## 2) Build APK for sharing (install directly)

```bash
npm run build:apk
```

This creates an Android `.apk` with internal distribution. EAS will print a shareable URL once the cloud build finishes.

## 3) Build AAB for Play Store

```bash
npm run build:aab
```

This creates an Android App Bundle (`.aab`) for Google Play submission.

## 4) First-time EAS project link (if prompted)

If EAS asks to configure/link the project, accept the prompt. It will create project metadata and continue.

## 5) Share with people

- For direct installs: send the APK build URL from EAS.
- For Play Store: upload AAB in Play Console.

## Notes

- Android package ID is `com.aditya.trailviewmobile` in `app.json`.
- Increase `expo.android.versionCode` for each Play Store update.
