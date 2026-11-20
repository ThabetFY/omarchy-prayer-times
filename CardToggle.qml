import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Measure the actual wrapped column, not the switch row's implicit height.
Rectangle {
    id: control
    property string label: ""
    property string description: ""
    property bool checked: false
    property string fontFamily: control.fontTokens.family
    property color foreground: Commons.Color.foreground
    readonly property var fontTokens: Style.font
    readonly property var spacingTokens: Style.spacing
    readonly property var popupColors: Commons.Color.popups
    signal clicked()

    implicitHeight: Math.max(Style.space(72), labels.implicitHeight + control.spacingTokens.rowPaddingX * 2, track.implicitHeight + control.spacingTokens.rowPaddingX * 2)
    radius: Style.cornerRadius
    color: Qt.tint(control.popupColors.background,
        Util.alpha(foreground, activeFocus || mouse.containsMouse ? 0.085 : 0.055))
    border.width: activeFocus ? control.spacingTokens.hairline : 0
    border.color: Commons.Color.accent
    activeFocusOnTab: true
    Keys.onReturnPressed: clicked()
    Keys.onEnterPressed: clicked()
    Keys.onSpacePressed: clicked()

    Column {
        id: labels
        anchors.left: parent.left
        anchors.right: track.left
        anchors.leftMargin: control.spacingTokens.rowPaddingX
        anchors.rightMargin: control.spacingTokens.rowPaddingX
        anchors.verticalCenter: parent.verticalCenter
        spacing: control.spacingTokens.xs

        Text {
            textFormat: Text.PlainText
            width: parent.width
            text: control.label
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignLeft
            color: control.foreground
            font.family: control.fontFamily
            font.pixelSize: control.fontTokens.heading
            font.weight: Font.DemiBold
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: control.description !== ""
            text: control.description
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignLeft
            color: Qt.darker(control.foreground, 1.55)
            font.family: control.fontFamily
            font.pixelSize: control.fontTokens.caption
        }
    }
    ToggleSwitch {
        id: track
        anchors.right: parent.right
        anchors.rightMargin: control.spacingTokens.rowPaddingX
        anchors.verticalCenter: parent.verticalCenter
        checked: control.checked
        foreground: control.foreground
        accent: Commons.Color.accent
        interactive: false
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: { control.forceActiveFocus(); control.clicked(); }
    }
}
