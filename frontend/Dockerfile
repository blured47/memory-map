FROM eclipse-temurin:17-jdk-jammy

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=$ANDROID_HOME
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip ca-certificates git \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Android SDK (cmdline-tools 11076708)
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
    && curl -fsSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q /tmp/tools.zip -d $ANDROID_HOME/cmdline-tools \
    && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
    && rm /tmp/tools.zip \
    && yes | sdkmanager --licenses >/dev/null \
    && sdkmanager "platform-tools" "platforms;android-35" "platforms;android-34" "build-tools;34.0.0" "build-tools;35.0.0"

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .

# 컨테이너 실행 시: 네이티브 프로젝트 생성 -> APK 빌드 -> /output 으로 복사
CMD ["sh", "-c", "npx expo prebuild --platform android --no-install --clean && cd android && ./gradlew assembleRelease --no-daemon && mkdir -p /output && cp app/build/outputs/apk/release/*.apk /output/app-release.apk"]
