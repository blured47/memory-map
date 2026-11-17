import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

const pad = (n) => String(n).padStart(2, '0');

// 날짜(와 시각)를 달력으로 고르는 칸. value 와 onChange 는 Date.
// iOS 는 누르면 달력·시각 휠이 뜨는 버튼, Android 는 버튼을 누르면 대화상자가 뜬다
export default function DateTimeField({ value, onChange, mode = 'datetime', minimumDate, maximumDate }) {
  const [androidMode, setAndroidMode] = useState(null); // 'date' | 'time'

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        locale="ko-KR"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event, picked) => picked && onChange(picked)}
      />
    );
  }

  const handle = (event, picked) => {
    setAndroidMode(null);
    if (event.type === 'set' && picked) onChange(picked);
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.button} onPress={() => setAndroidMode('date')}>
        <Text style={styles.text}>
          {value.getFullYear()}.{pad(value.getMonth() + 1)}.{pad(value.getDate())}
        </Text>
      </Pressable>
      {mode === 'datetime' && (
        <Pressable style={styles.button} onPress={() => setAndroidMode('time')}>
          <Text style={styles.text}>
            {pad(value.getHours())}:{pad(value.getMinutes())}
          </Text>
        </Pressable>
      )}
      {androidMode && (
        <DateTimePicker
          value={value}
          mode={androidMode}
          is24Hour
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handle}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  button: { backgroundColor: colors.grey100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  text: { fontSize: 15, color: colors.text },
});
