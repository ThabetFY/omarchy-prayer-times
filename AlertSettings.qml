pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Dialogs
import qs.Commons as Commons
import qs.Ui as Ui
import "Model.js" as Model

Column {
    id: root
    required property PluginTranslations strings
    required property var settings
    required property string fontFamily
    property string soundPath: ""
    property bool soundRunning: false
    property string soundError: ""
    property string selectedPrayer: "Fajr"
    readonly property var config: Model.notificationConfig(settings)
    readonly property var fontTokens: Commons.Style.font
    readonly property var rule: config.scope === "each"
        ? Model.notificationRule(config, selectedPrayer) : config.alerts
    signal changed(var values)
    signal previewRequested()
    signal stopRequested()
    spacing: Commons.Style.space(6)

    function closeDropdowns() { soundPicker.close(); }
    function updateAlert(phase, values) {
        root.changed(Model.notificationChange(root.config,
            root.config.scope === "each" ? root.selectedPrayer : "", phase, values));
    }

    AlertToggleRow {
        width: parent.width
        strings: root.strings
        fontFamily: root.fontFamily
        label: root.strings.t("notifications.enabled")
        checked: root.config.scope !== "off"
        onToggled: root.changed({
            notificationEnabled: !checked,
            notificationScope: root.settings.notificationScope === "all" ? "all" : "each"
        })
    }
    Column {
        width: parent.width
        visible: root.config.scope !== "off"
        spacing: Commons.Style.space(6)
        AlertToggleRow {
            width: parent.width
            strings: root.strings
            fontFamily: root.fontFamily
            label: root.strings.t("notifications.perPrayer")
            checked: root.config.scope === "each"
            onToggled: root.changed({ notificationScope: checked ? "all" : "each" })
        }
        Row {
            width: parent.width
            visible: root.config.scope === "each"
            spacing: Commons.Style.space(4)
            Repeater {
                model: Model.PRAYERS
                delegate: Ui.Button {
                    id: prayerButton
                    required property string modelData
                    width: (root.width - Commons.Style.space(4) * 4) / 5
                    implicitHeight: Commons.Style.space(34)
                    text: root.strings.t(prayerButton.modelData)
                    fontFamily: root.fontFamily
                    fontSize: root.fontTokens.bodySmall
                    horizontalPadding: Commons.Style.space(3)
                    selected: root.selectedPrayer === prayerButton.modelData
                    focusable: true
                    onClicked: root.selectedPrayer = prayerButton.modelData
                }
            }
        }
        Repeater {
            model: Model.ALERT_PHASES
            delegate: AlertToggleRow {
                id: phaseRow
                required property string modelData
                width: root.width
                strings: root.strings
                fontFamily: root.fontFamily
                label: root.strings.t("notifications.phase." + phaseRow.modelData)
                checked: root.rule[phaseRow.modelData].enabled
                hasMinutes: phaseRow.modelData !== "at"
                minutes: root.rule[phaseRow.modelData].minutes
                onToggled: root.updateAlert(phaseRow.modelData, { enabled: !checked })
                onEdited: function(value) { root.updateAlert(phaseRow.modelData, { minutes: value }); }
            }
        }
        Ui.Button {
            width: parent.width
            visible: root.config.scope === "each" && Object.keys(root.config.prayers[root.selectedPrayer]).length > 0
            text: root.strings.t("notifications.useShared")
            fontFamily: root.fontFamily
            fontSize: root.fontTokens.caption
            focusable: true
            onClicked: root.changed(Model.resetPrayerNotifications(root.config, root.selectedPrayer))
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            wrapMode: Text.Wrap
            text: root.strings.t("notifications.iqamaNote")
            color: Qt.darker(Commons.Color.foreground, 1.55)
            font.family: root.fontFamily
            font.pixelSize: root.fontTokens.caption
            horizontalAlignment: Text.AlignLeft
        }
        AlertToggleRow {
            width: parent.width
            strings: root.strings
            fontFamily: root.fontFamily
            label: root.strings.t("notifications.sound")
            checked: root.settings.notificationSoundEnabled === true
            onToggled: root.changed({ notificationSoundEnabled: !checked })
        }
        Column {
            width: parent.width
            visible: root.settings.notificationSoundEnabled === true
            spacing: Commons.Style.space(6)
            CardButton {
                width: parent.width
                text: root.strings.t("notifications.chooseSound")
                fontFamily: root.fontFamily
                focusable: true
                onClicked: soundPicker.open()
            }
            Text {
                textFormat: Text.PlainText
                width: parent.width
                elide: Text.ElideMiddle
                text: root.soundPath || root.strings.t("notifications.noSound")
                color: Qt.darker(Commons.Color.foreground, 1.55)
                font.family: root.fontFamily
                font.pixelSize: root.fontTokens.caption
                horizontalAlignment: Text.AlignLeft
            }
            CardButton {
                width: parent.width
                text: root.strings.t(root.soundRunning ? "notifications.stopSound" : "notifications.previewSound")
                enabled: root.soundPath !== "" || root.soundRunning
                fontFamily: root.fontFamily
                focusable: true
                onClicked: root.soundRunning ? root.stopRequested() : root.previewRequested()
            }
            Text {
                textFormat: Text.PlainText
                width: parent.width
                wrapMode: Text.Wrap
                text: root.soundError ? root.strings.t(root.soundError) : root.strings.t("notifications.soundDescription")
                color: root.soundError ? Commons.Color.accent : Qt.darker(Commons.Color.foreground, 1.55)
                font.family: root.fontFamily
                font.pixelSize: root.fontTokens.caption
                horizontalAlignment: Text.AlignLeft
            }
        }
    }
    FileDialog {
        id: soundPicker
        title: root.strings.t("notifications.chooseSound")
        fileMode: FileDialog.OpenFile
        nameFilters: [root.strings.t("notifications.audioFiles")]
        onAccepted: root.changed({ notificationSoundFile: selectedFile.toString() })
    }
}
