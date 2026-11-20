import QtQuick
import qs.Commons
import qs.Commons as Commons

// Shared filled surface, type scale and inset for the timetable's actions.
Rectangle {
    id: control
    property string text: ""
    property string iconText: ""
    property string fontFamily: control.fontTokens.family
    property color foreground: Commons.Color.foreground
    property bool focusable: true
    readonly property var fontTokens: Style.font
    readonly property var spacingTokens: Style.spacing
    readonly property var popupColors: Commons.Color.popups
    signal clicked()

    implicitHeight: Style.space(54)
    radius: Style.cornerRadius
    color: Qt.tint(control.popupColors.background,
        Util.alpha(foreground, activeFocus || mouse.containsMouse ? 0.085 : 0.055))
    border.width: activeFocus ? control.spacingTokens.hairline : 0
    border.color: Commons.Color.accent
    opacity: enabled ? 1 : 0.45
    activeFocusOnTab: focusable
    Keys.onReturnPressed: clicked()
    Keys.onEnterPressed: clicked()
    Keys.onSpacePressed: clicked()

    Text {
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.right: icon.left
        anchors.leftMargin: control.spacingTokens.rowPaddingX
        anchors.rightMargin: Style.space(12)
        anchors.verticalCenter: parent.verticalCenter
        horizontalAlignment: Text.AlignLeft
        text: control.text
        elide: Text.ElideRight
        color: control.foreground
        font.family: control.fontFamily
        font.pixelSize: control.fontTokens.heading
        font.weight: Font.DemiBold
    }
    Text {
        id: icon
        textFormat: Text.PlainText
        anchors.right: parent.right
        anchors.rightMargin: control.spacingTokens.rowPaddingX
        anchors.verticalCenter: parent.verticalCenter
        text: control.iconText
        color: control.foreground
        font.family: control.fontFamily
        font.pixelSize: control.fontTokens.heading
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: { control.forceActiveFocus(); control.clicked(); }
    }
}
