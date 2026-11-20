import QtQuick
import QtTest
import "../../Model.js" as Model

TestCase {
    name: "PrayerAlerts"
    AlertClient { id: firstScreen }
    AlertClient { id: secondScreen }

    function test_sharedDelivery() {
        var event = { id: "native-qml-shared-alert", prayerAt: Date.now() };
        verify(firstScreen.claim(event, event.prayerAt));
        verify(!secondScreen.claim(event, event.prayerAt));
    }

    function test_perPrayerDefaults() {
        var initial = Model.notificationConfig({});
        compare(initial.scope, "off");
        compare(initial.alerts.at.enabled, true);
        compare(initial.alerts.before.enabled, false);
        compare(initial.alerts.iqama.enabled, false);
        var config = Model.notificationConfig({ notificationEnabled: true, notificationScope: "each" });
        var minutes = [[15, 20], [10, 10], [10, 10], [5, 5], [10, 15]];
        for (var i = 0; i < Model.PRAYERS.length; i++) {
            var rule = Model.notificationRule(config, Model.PRAYERS[i]);
            compare(rule.before.minutes, minutes[i][0]);
            compare(rule.iqama.minutes, minutes[i][1]);
            compare(rule.before.enabled, false);
            compare(rule.at.enabled, true);
            compare(rule.iqama.enabled, false);
        }
        var patch = Model.notificationChange(config, "", "iqama", { enabled: true });
        config = Model.notificationConfig({
            notificationEnabled: true, notificationScope: "each", notificationAlerts: patch.notificationAlerts
        });
        compare(Model.notificationRule(config, "Fajr").iqama.minutes, 20);
        compare(Model.notificationRule(config, "Maghrib").iqama.minutes, 5);
        compare(Model.notificationRule(config, "Maghrib").iqama.enabled, true);
    }

    function test_sparseOverridesKeepSharedInheritance() {
        var config = Model.notificationConfig({ notificationEnabled: true, notificationScope: "each" });
        var patch = Model.notificationChange(config, "Fajr", "iqama", { enabled: true });
        compare(Object.keys(patch.prayerNotifications.Fajr).length, 1);
        compare(Object.keys(patch.prayerNotifications.Fajr.iqama).length, 1);
        config = Model.notificationConfig({
            notificationEnabled: true, notificationScope: "each",
            prayerNotifications: patch.prayerNotifications,
            notificationAlerts: { at: { enabled: false }, iqama: { minutes: 30 } }
        });
        var rule = Model.notificationRule(config, "Fajr");
        compare(rule.at.enabled, false);
        compare(rule.iqama.enabled, true);
        compare(rule.iqama.minutes, 30);
    }

    function test_nativeTimingAndRules() {
        var at = new Date(2026, 10, 20, 15, 0).getTime();
        var schedule = {
            city: { name: "Test", latitude: 24, longitude: 46, timezone: "Asia/Riyadh" },
            timestamps: { Fajr: at - 36000000, Dhuhr: at - 7200000, Asr: at, Maghrib: at + 7200000, Isha: at + 10800000 },
            timings: { Fajr: "05:00", Dhuhr: "13:00", Asr: "15:00", Maghrib: "17:00", Isha: "18:00" },
            expiresAt: at + 32400000, nextFajr: at + 50400000, nextFajrTime: "05:00"
        };
        var config = Model.notificationConfig({
            notificationEnabled: true, notificationScope: "each",
            prayerNotifications: { Asr: { before: { enabled: true, minutes: 7 } } }
        });
        var before = at - 7 * 60000;
        compare(Model.prayerAlerts(schedule, config, before - 1, before)[0].phase, "before");
        compare(Model.prayerAlerts(schedule, config, at - 1, at)[0].phase, "at");
        compare(Model.prayerAlerts(schedule, config, at - 1, at + 61000).length, 0);
        config.prayers.Asr = { before: { enabled: false }, at: { enabled: false } };
        compare(Model.prayerAlerts(schedule, config, at - 1, at).length, 0);
        var patch = Model.notificationChange(config, "Asr", "iqama", { enabled: true, minutes: 20 });
        config.prayers = patch.prayerNotifications;
        compare(Model.prayerAlerts(schedule, config, at + 1200000 - 1, at + 1200000)[0].phase, "iqama");
    }

    function test_localFilesAndNotificationArguments() {
        compare(Model.localSoundPath("file:///home/test/my%20sound.ogg", "/home/test"), "/home/test/my sound.ogg");
        compare(Model.localSoundPath("https://example.invalid/sound.ogg", "/home/test"), "");
        var args = Model.notificationCommand("Prayer", "<img src=x> &lt;tag&gt;");
        compare(args[0], "omarchy-notification-send");
        verify(!/[<>&]/.test(args[args.length - 1]));
        var options = Model.notificationCommand("--exec", "--image=https://example.invalid/pixel");
        compare(options[options.length - 2], " --exec");
        compare(options[options.length - 1], " --image=https://example.invalid/pixel");
    }
}
