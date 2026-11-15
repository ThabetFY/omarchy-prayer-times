import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Commons as Commons

// Keep the trigger and choices on the timetable's filled card surfaces.
Rectangle {
    id: control
    property string label: ""
    property string value: ""
    property var options: []
    property string fontFamily: Style.font.family
    property color foreground: Commons.Color.foreground
    readonly property int selectedIndex: options.findIndex(function(option) { return option.value === control.value; })
    signal changed(string value)

    function close() { popup.close(); }

    implicitHeight: Style.space(72)
    radius: Style.cornerRadius
    color: Qt.tint(Commons.Color.popups.background,
        Util.alpha(foreground, activeFocus || mouse.containsMouse || popup.opened ? 0.085 : 0.055))
    border.width: activeFocus ? Style.spacing.hairline : 0
    border.color: Commons.Color.accent
    activeFocusOnTab: true
    Keys.onPressed: function(event) {
        if ([Qt.Key_Return, Qt.Key_Enter, Qt.Key_Space, Qt.Key_Down].indexOf(event.key) >= 0) {
            popup.opened ? popup.close() : popup.open();
            event.accepted = true;
        }
    }

    Column {
        anchors.left: parent.left
        anchors.right: chevron.left
        anchors.leftMargin: Style.spacing.rowPaddingX
        anchors.rightMargin: Style.space(12)
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(4)
        Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: control.label !== ""
            horizontalAlignment: Text.AlignLeft
            text: control.label
            color: Qt.darker(control.foreground, 1.55)
            font.family: control.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            horizontalAlignment: Text.AlignLeft
            text: control.selectedIndex >= 0 ? control.options[control.selectedIndex].label : control.value
            color: control.foreground
            font.family: control.fontFamily
            font.pixelSize: Style.font.heading
            font.weight: Font.DemiBold
            elide: Text.ElideRight
        }
    }
    Text {
        id: chevron
        textFormat: Text.PlainText
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.rowPaddingX
        anchors.verticalCenter: parent.verticalCenter
        text: "󰅀"
        color: Qt.darker(control.foreground, 1.55)
        font.family: control.fontFamily
        font.pixelSize: Style.font.heading
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: { control.forceActiveFocus(); popup.opened ? popup.close() : popup.open(); }
    }
    Popup {
        id: popup
        x: 0
        y: control.height + Style.space(4)
        width: control.width
        implicitHeight: Math.min(optionList.contentHeight, Style.space(288)) + padding * 2
        padding: Style.space(6)
        focus: true
        closePolicy: Popup.CloseOnPressOutsideParent | Popup.CloseOnEscape
        background: Rectangle {
            color: Commons.Color.popups.background
            radius: Style.cornerRadius
        }
        onOpened: {
            var selected = Math.max(0, control.selectedIndex);
            optionList.currentIndex = selected;
            optionList.positionViewAtIndex(selected, ListView.Contain);
            optionList.forceActiveFocus();
        }
        onClosed: control.forceActiveFocus()
        contentItem: ListView {
            id: optionList
            LayoutMirroring.enabled: control.LayoutMirroring.enabled
            LayoutMirroring.childrenInherit: true
            model: control.options
            spacing: Style.space(4)
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            function selectCurrent() {
                if (currentIndex < 0 || currentIndex >= control.options.length) return;
                control.changed(control.options[currentIndex].value);
                popup.close();
            }
            Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) popup.close();
                else if (event.key === Qt.Key_Down || event.text === "j") currentIndex = Math.min(count - 1, currentIndex + 1);
                else if (event.key === Qt.Key_Up || event.text === "k") currentIndex = Math.max(0, currentIndex - 1);
                else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) selectCurrent();
                else return;
                positionViewAtIndex(currentIndex, ListView.Contain);
                event.accepted = true;
            }
            delegate: Rectangle {
                required property var modelData
                required property int index
                width: optionList.width
                height: Style.space(44)
                radius: Style.cornerRadius
                color: Qt.tint(Commons.Color.popups.background,
                    Util.alpha(control.foreground, index === optionList.currentIndex ? 0.10 : 0.055))
                Text {
                    textFormat: Text.PlainText
                    anchors.fill: parent
                    anchors.leftMargin: Style.spacing.rowPaddingX
                    anchors.rightMargin: Style.spacing.rowPaddingX
                    horizontalAlignment: Text.AlignLeft
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                    text: modelData.label
                    color: control.foreground
                    font.family: control.fontFamily
                    font.pixelSize: Style.font.body
                }
                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onPositionChanged: optionList.currentIndex = parent.index
                    onClicked: { optionList.currentIndex = parent.index; optionList.selectCurrent(); }
                }
            }
        }
    }
}
