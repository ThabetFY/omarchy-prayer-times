pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import qs.Commons as Commons
import qs.Ui as Ui

Rectangle {
    id: root
    required property PluginTranslations strings
    required property string fontFamily
    property string label: ""
    property bool checked: false
    property bool hasMinutes: false
    property int minutes: 10
    readonly property var fontTokens: Commons.Style.font
    readonly property var popupColors: Commons.Color.popups
    signal toggled()
    signal edited(int minutes)
    implicitHeight: Commons.Style.space(48)
    radius: Commons.Style.cornerRadius
    color: Qt.tint(root.popupColors.background, Commons.Util.alpha(Commons.Color.foreground, 0.055))

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Commons.Style.space(12)
        anchors.rightMargin: Commons.Style.space(6)
        spacing: Commons.Style.space(6)
        Text {
            textFormat: Text.PlainText
            text: root.label
            Layout.fillWidth: true
            elide: Text.ElideRight
            font.family: root.fontFamily
            font.pixelSize: root.fontTokens.body
            color: Commons.Color.foreground
            horizontalAlignment: Text.AlignLeft
        }
        Ui.NumberField {
            visible: root.hasMinutes
            Layout.preferredWidth: Commons.Style.space(80)
            Layout.alignment: Qt.AlignVCenter
            fieldWidth: Commons.Style.space(80)
            from: 1
            to: 60
            value: root.minutes
            fontFamily: root.fontFamily
            fontSize: root.fontTokens.bodySmall
            field.implicitHeight: Commons.Style.space(32)
            field.activeFocusOnTab: true
            field.locale: Qt.locale(root.strings.followsSystem ? Commons.I18n.formatLocale : root.strings.language.replace(/-/g, "_"))
            onModified: function(value) { root.edited(value); }
        }
        Text {
            textFormat: Text.PlainText
            visible: root.hasMinutes
            text: root.strings.t("notifications.minuteUnit")
            color: Qt.darker(Commons.Color.foreground, 1.4)
            font.family: root.fontFamily
            font.pixelSize: root.fontTokens.caption
        }
        Ui.ToggleSwitch {
            id: toggle
            checked: root.checked
            Layout.preferredWidth: Commons.Style.space(48)
            Layout.preferredHeight: Commons.Style.space(40)
            trackHeight: Commons.Style.space(20)
            activeFocusOnTab: true
            hasCursor: activeFocus
            Accessible.role: Accessible.CheckBox
            Accessible.name: root.label
            Accessible.checked: root.checked
            Accessible.onPressAction: root.toggled()
            Keys.onSpacePressed: root.toggled()
            Keys.onReturnPressed: root.toggled()
            Keys.onEnterPressed: root.toggled()
            onToggled: root.toggled()
        }
    }
}
