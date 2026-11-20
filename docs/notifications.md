# تنبيهات الصلاة · Prayer notifications

## العربية

افتح **الترس ← تنبيهات الصلاة**. **التنبيهات** معطّلة افتراضيًا؛ إيقافها لا
يحذف اختياراتك. عند تفعيلها في إعداد جديد، يعمل **لكل صلاة** بالإعدادات التالية:

| التنبيه | الموعد | الافتراضي |
| --- | --- | --- |
| قبل الأذان | قبل دخول الوقت | معطّل |
| عند الأذان | عند دخول الوقت | مفعّل |
| الإقامة | بعد الأذان بالدقائق المحددة | معطّل |

الإعدادات المحفوظة لها الأولوية، بما فيها اختيارات النسخ السابقة.

الدقائق المسبقة قابلة للتعديل من 1 إلى 60:

| الصلاة | قبل الأذان (دقيقة) | الإقامة بعد الأذان (دقيقة) |
| --- | --- | --- |
| الفجر | 15 | 20 |
| الظهر | 10 | 10 |
| العصر | 10 | 10 |
| المغرب | 5 | 5 |
| العشاء | 10 | 15 |

الإقامة تذكير تضبطه حسب مسجدك، وليست موعدًا مجلوبًا منه.

- **لكل صلاة**: اختر الصلاة لتخصيصها؛ أوقفه للإعداد المشترك. تخصيص حقل يترك بقية الحقول تتبع الإعداد المشترك.
- **استخدام الإعداد المشترك**: يحذف تخصيص الصلاة المختارة فقط.
- تحديد دقائق مشتركة يستبدل الدقائق المسبقة ما لم تخصّصها للصلاة؛ تغيير المفتاح وحده لا يستبدلها.

الصوت معطّل افتراضيًا: ملف WAV أو OGG أو FLAC أو MP3 محلي، بحد 30 ثانية.
يحترم التشغيل التلقائي وضع عدم الإزعاج؛ المعاينة لا تخضع له. لا تحميل من الإنترنت.

تعمل التنبيهات للصلوات الخمس، دون الشروق، وتتطلب تشغيل الإضافة وجدولًا صالحًا.
لا توقظ الجهاز، وتتجاهل التنبيهات المتأخرة أكثر من دقيقة. قد يصدر تنبيه إقامة
العشاء بعد منتصف الليل إذا جرى تجهيزه قبله.

## English

Open **gear → Prayer notifications**. **Alerts** is off by default; turning it
off keeps your choices. Enabling it in a new setup selects **Per prayer** with:

| Alert | Timing | Default |
| --- | --- | --- |
| Before | Before adhan | Off |
| At time | At adhan | On |
| Iqama | Configured minutes after adhan | Off |

Saved settings take priority, including choices from earlier versions.

Minute presets, editable from 1 to 60:

| Prayer | Before adhan (min) | Iqama after adhan (min) |
| --- | --- | --- |
| Fajr | 15 | 20 |
| Dhuhr | 10 | 10 |
| Asr | 10 | 10 |
| Maghrib | 5 | 5 |
| Isha | 10 | 15 |

Iqama is a reminder you set for your mosque, not a fetched mosque time.

- **Per prayer**: select a prayer to customize it; turn off for shared settings. Only edited fields override shared settings.
- **Use shared settings**: clears only the selected prayer's overrides.
- Shared minutes replace the presets unless overridden for a prayer; shared switches alone do not.

Sound (off by default): local WAV, OGG, FLAC or MP3, up to 30 seconds.
Automatic playback respects Do Not Disturb; manual preview does not. No downloads.

Alerts cover five prayers, not sunrise, and require a running widget and valid
timetable. They do not wake the computer and skip alerts over a minute late.
An Isha Iqama armed before midnight may fire after it.

Iqama presets: [Azan-MCP](https://github.com/ahmedeltaher/azan-mcp/blob/main/src/azan_mcp/config.py).
Before presets are suggestions; neither is a universal mosque schedule.

## JSON settings

Fields on the `thabetfy.prayer-times` entry in `~/.config/omarchy/shell.json`:

| Key | Values |
| --- | --- |
| `notificationEnabled` | Master switch; `false` (default) stops alerts without clearing settings. `true` requires an `all` or `each` scope. |
| `notificationScope` | `off` (unset), `all` (shared), or `each` (per prayer). New setups select `each` when enabled in the UI. |
| `notificationAlerts` | Shared `before`, `at`, and `iqama` objects: boolean `enabled`; integer `minutes` from 1 to 60 for `before` and `iqama`. |
| `prayerNotifications` | Alert overrides keyed by `Fajr`, `Dhuhr`, `Asr`, `Maghrib`, or `Isha`. |
| `notificationSoundEnabled` | `false` (default) or `true`. |
| `notificationSoundFile` | Local absolute path, `~/…`, or `file:///…` URL; no remote URLs. |

In `each` mode, fields resolve as: prayer override → shared value → preset.
In `all` mode, unset minutes fall back to 10 before adhan and 15 after.

Example: at-time alerts for all prayers, plus Fajr reminders 20 minutes before
and 25 minutes after adhan.

```json
{
  "notificationEnabled": true,
  "notificationScope": "each",
  "notificationAlerts": {
    "before": { "enabled": false },
    "at": { "enabled": true },
    "iqama": { "enabled": false }
  },
  "prayerNotifications": {
    "Fajr": {
      "before": { "enabled": true, "minutes": 20 },
      "iqama": { "enabled": true, "minutes": 25 }
    }
  }
}
```
