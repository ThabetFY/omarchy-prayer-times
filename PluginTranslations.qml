import QtQuick
import Quickshell.Io
import qs.Commons as Commons
import "Language.js" as Language

// Commons.Translations follows the shell and has a read-only language property.
// Keep its behavior for "system"; local files provide the explicit override.
QtObject {
    id: root
    property string requestedLanguage: "system"
    readonly property var languages: Language.parseRegistry(registryFile.text())
    readonly property string preference: Language.preference(requestedLanguage, languages)
    readonly property bool followsSystem: preference === "system"
    readonly property string language: followsSystem ? Commons.I18n.language : preference
    readonly property string baseLanguage: language.split("-")[0]
    readonly property bool rightToLeft: {
        if (followsSystem) return Commons.I18n.rightToLeft;
        for (let i = 0; i < languages.length; i++)
            if (languages[i].code === language) return languages[i].rtl;
        return false;
    }
    readonly property var selectedCatalog: Language.parseCatalog(selectedFile.text())
    readonly property var baseCatalog: Language.parseCatalog(baseFile.text())
    readonly property var englishCatalog: Language.parseCatalog(englishFile.text())
    readonly property var options: [{ value: "system", label: t("language.system") }].concat(
        languages.map(function(entry) { return { value: entry.code, label: entry.name }; }))

    function t(key) {
        return followsSystem ? systemStrings.t(key)
            : Language.lookup(key, selectedCatalog, baseCatalog, englishCatalog);
    }
    function formatNumber(value) {
        return followsSystem ? Commons.I18n.formatNumber(value)
            : Number(value).toLocaleString(Qt.locale(language.replace(/-/g, "_")), "f", 0);
    }
    function formatTime(time, clock12) {
        return Language.formatTime(time, clock12, root);
    }
    function formatDateTime(epoch) {
        var locale = Qt.locale(followsSystem ? Commons.I18n.formatLocale : language.replace(/-/g, "_"));
        return new Date(epoch).toLocaleString(locale, Locale.ShortFormat);
    }

    property Commons.Translations systemStrings: Commons.Translations {
        directory: Qt.resolvedUrl("i18n")
    }
    property FileView registryFile: FileView {
        path: Qt.resolvedUrl("i18n/languages.json")
        blockLoading: true
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
    }
    property FileView englishFile: FileView {
        path: Qt.resolvedUrl("i18n/en.json")
        blockLoading: true
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
    }
    property FileView selectedFile: FileView {
        path: !root.followsSystem ? Qt.resolvedUrl("i18n/" + root.preference + ".json") : ""
        blockLoading: true
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
    }
    property FileView baseFile: FileView {
        path: !root.followsSystem && root.baseLanguage !== root.language
            ? Qt.resolvedUrl("i18n/" + root.baseLanguage + ".json") : ""
        blockLoading: true
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
    }
}
