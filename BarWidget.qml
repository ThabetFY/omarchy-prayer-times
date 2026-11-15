import QtQuick
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
    id: root
    moduleName: "thabetfy.prayer-times"
    LayoutMirroring.enabled: strings.rightToLeft
    LayoutMirroring.childrenInherit: true

    PluginTranslations {
        id: strings
        requestedLanguage: String(root.setting("language", "system"))
    }
    function t(key) { return strings.t(key); }
    function countdownLabel(next, current) {
        if (!next) return "";
        var minutes = Math.max(0, Math.ceil((next.date.getTime() - current.getTime()) / 60000));
        var name = t(next.key);
        if (!minutes) return t("countdown.now").arg(name);
        var duration = minutes >= 60
            ? t("duration.hoursMinutes").arg(strings.formatNumber(Math.floor(minutes / 60))).arg(strings.formatNumber(minutes % 60))
            : t("duration.minutes").arg(strings.formatNumber(minutes));
        return t("countdown.remaining").arg(name).arg(duration);
    }

    readonly property string cachePath: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/omarchy/plugins/thabetfy.prayer-times/timetable.json"
    readonly property string scriptPath: decodeURIComponent(Qt.resolvedUrl("prayer-fetch.sh").toString().replace(/^file:\/\//, ""))
    property var schedule: null
    readonly property var timings: schedule ? schedule.timings : null
    readonly property var cities: Model.savedCities(setting("cities", null), setting("city", null))
    readonly property var city: Model.activeCity(cities, setting("city", null))
    readonly property string selectedCityKey: Model.cityKey(city)
    property var scheduleCache: ({})
    property string fetchingCityKey: ""
    property int fetchingMethod: -1
    property int fetchingSchool: -1
    property double lastAttempt: 0
    property double lastUpdatedAt: 0
    property bool refreshFailed: false
    readonly property bool autoRefresh: setting("autoRefresh", true) !== false
    property bool settingsOpen: false
    readonly property bool settingsVisible: settingsOpen || !city
    property bool editingCity: false
    readonly property bool selectingCity: settingsVisible && (editingCity || !city)
    property var cityResults: []
    property string citySearchError: ""
    property string error: ""
    property bool popupOpen: false
    property date now: new Date()
    readonly property bool opened: popupOpen
    readonly property int calculationMethod: Model.normalizedMethod(setting("calculationMethod", Quickshell.env("PRAYER_METHOD") || 3))
    readonly property int asrSchool: Model.normalizedSchool(setting("asrSchool", 0))
    readonly property string statusKey: Model.scheduleStatus(schedule, fetchProcess.running, refreshFailed, autoRefresh)
    readonly property bool clock12: setting("clock12", false) === true
    readonly property bool showCountdown: setting("showCountdown", true) !== false
    readonly property var nextPrayer: Model.nextPrayer(schedule, now)
    readonly property string tooltipLabel: nextPrayer ? countdownLabel(nextPrayer, now) : t("title")
    readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
    readonly property color dim: Qt.darker(foreground, 1.55)
    readonly property string contentFont: bar ? bar.fontFamily : Style.font.family

    component PanelText: Text {
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.contentFont
        font.pixelSize: Style.font.bodySmall
        horizontalAlignment: Text.AlignLeft
    }

    function refresh(force) {
        if (!city) return;
        var cached = scheduleCache[selectedCityKey];
        if (!Model.usableSchedule(cached, city, calculationMethod, Date.now(), asrSchool))
            cached = Model.parseCache(cacheFile.text());
        if (force !== true && Model.usableSchedule(cached, city, calculationMethod, Date.now(), asrSchool)) {
            applyData(cached);
            return;
        }
        if (fetchProcess.running || (force !== true && !autoRefresh)) return;
        lastAttempt = Date.now();
        refreshFailed = false;
        error = "";
        fetchingCityKey = selectedCityKey;
        fetchingMethod = calculationMethod;
        fetchingSchool = asrSchool;
        fetchProcess.command = ["bash", root.scriptPath, String(root.calculationMethod), JSON.stringify(root.city), String(root.asrSchool)];
        fetchProcess.running = true;
    }
    function searchCities() {
        var query = cityField.text.trim();
        if (query.length < 2 || query.length > 120 || citySearchProcess.running) return;
        cityResults = [];
        citySearchError = "";
        citySearchProcess.command = ["bash", root.scriptPath, "--search", query, strings.baseLanguage];
        citySearchProcess.running = true;
    }
    function selectCity(value) {
        var selected = Model.normalizedCity(value);
        var saved = Model.addCity(cities, selected);
        if (!saved) {
            citySearchError = "يمكن حفظ 8 مدن كحد أقصى";
            return;
        }
        if (!persistSettings({ cities: saved, city: selected })) return;
        editingCity = false;
        settingsOpen = false;
        cityResults = [];
        cityField.text = "";
    }
    function activateCity(key) {
        for (var i = 0; i < cities.length; i++) {
            if (Model.cityKey(cities[i]) === key) {
                persistSettings({ city: cities[i] });
                return;
            }
        }
    }
    function removeCity(key) {
        var remaining = Model.removeCity(cities, key);
        var selected = Model.activeCity(remaining, city);
        persistSettings({ cities: remaining, city: selected });
    }
    function toggleSettings() {
        closeDropdowns();
        settingsOpen = !settingsVisible;
        editingCity = false;
        if (!city) Qt.callLater(function() { cityField.forceActiveFocus(); });
    }
    function open() {
        now = new Date();
        settingsOpen = false;
        editingCity = false;
        popupOpen = true;
        if (selectingCity) Qt.callLater(function() { cityField.forceActiveFocus(); });
    }
    function close() {
        closeDropdowns();
        popupOpen = false;
    }
    function closeDropdowns() {
        languageSelector.close();
        methodSelector.close();
        schoolSelector.close();
        citySelector.close();
    }
    function persistSettings(values) {
        var entry = {
            id: moduleName
        };
        for (var key in settings)
            entry[key] = settings[key];
        for (var name in values)
            entry[name] = values[name];
        if (!bar || !bar.shell || typeof bar.shell.updateEntryInline !== "function" || !bar.shell.updateEntryInline(moduleName, entry)) {
            error = "تعذر حفظ الإعدادات";
            return false;
        }
        settings = entry;
        return true;
    }
    function applyData(data, requestCityKey, requestMethod, requestSchool) {
        if (!city) return;
        if (requestCityKey !== undefined && (requestCityKey !== selectedCityKey || requestMethod !== calculationMethod || requestSchool !== asrSchool)) return;
        if (!data || data.error) {
            if (requestCityKey !== undefined) {
                refreshFailed = true;
                error = data ? data.error : "تعذر جلب المواقيت";
            }
            return;
        }
        if (!Model.usableSchedule(data, city, calculationMethod, Date.now(), asrSchool)) return;
        var cache = {};
        for (var i = 0; i < cities.length; i++) {
            var key = Model.cityKey(cities[i]);
            if (Model.usableSchedule(scheduleCache[key], cities[i], calculationMethod, Date.now(), asrSchool))
                cache[key] = scheduleCache[key];
        }
        cache[selectedCityKey] = data;
        scheduleCache = cache;
        schedule = data;
        lastUpdatedAt = data.updatedAt;
        refreshFailed = false;
        error = "";
    }

    function resetSchedule() {
        schedule = null;
        lastUpdatedAt = 0;
        refreshFailed = false;
        error = "";
        Qt.callLater(refresh);
    }

    Component.onCompleted: refresh()
    onCalculationMethodChanged: {
        scheduleCache = {};
        resetSchedule();
    }
    onAsrSchoolChanged: {
        scheduleCache = {};
        resetSchedule();
    }
    onSelectedCityKeyChanged: resetSchedule()
    onAutoRefreshChanged: {
        if (autoRefresh) Qt.callLater(refresh);
    }
    onSettingsVisibleChanged: Qt.callLater(function() { panelScroll.contentY = 0; })

    FileView {
        id: cacheFile
        path: root.cachePath
        blockLoading: true
        watchChanges: true
        printErrors: false
        onLoaded: root.applyData(Model.parseCache(text()))
        onFileChanged: reload()
    }

    Process {
        id: citySearchProcess
        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: {
                var result = Model.parseCities(text);
                root.cityResults = result.cities;
                root.citySearchError = result.error || (result.cities.length ? "" : "لم يتم العثور على مدن");
            }
        }
    }

    Process {
        id: fetchProcess
        onExited: {
            if (root.fetchingCityKey !== root.selectedCityKey || root.fetchingMethod !== root.calculationMethod || root.fetchingSchool !== root.asrSchool)
                Qt.callLater(root.refresh);
        }
        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: root.applyData(Model.parseCache(text), root.fetchingCityKey, root.fetchingMethod, root.fetchingSchool)
        }
    }

    Timer {
        interval: 30000
        running: true
        repeat: true
        onTriggered: {
            root.now = new Date();
            if (root.schedule && root.now.getTime() >= root.schedule.expiresAt) {
                root.schedule = null;
            }
            if (Model.shouldRefresh(root.city, root.schedule, root.autoRefresh, fetchProcess.running, root.lastAttempt, root.now.getTime()))
                root.refresh();
        }
    }

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: root.vertical || !root.showCountdown ? "" : root.countdownLabel(root.nextPrayer, root.now)
        labelVisible: false
        hasVisualContent: true
        fixedWidth: root.vertical ? -1 : barLabel.implicitWidth + scaledHorizontalMargin * 2
        tooltipText: root.tooltipLabel
        onPressed: function (button) {
            if (button === Qt.RightButton || button === Qt.MiddleButton)
                root.refresh(true);
            else if (root.popupOpen)
                root.close();
            else
                root.open();
        }

        Row {
            id: barLabel
            anchors.centerIn: parent
            spacing: countdown.visible ? Style.space(6) : 0

            OpticalGlyph {
                width: Style.bar.iconCanvas
                height: button.height
                text: ""
                fontFamily: button.fontFamily
                fontSize: Style.bar.iconFont
                color: button.foreground
            }
            Text {
                id: countdown
                visible: !root.vertical && button.text !== ""
                height: button.height
                textFormat: Text.PlainText
                text: button.text
                font.family: button.fontFamily
                font.pixelSize: button.fontSize
                color: button.foreground
                verticalAlignment: Text.AlignVCenter
                renderType: Text.NativeRendering
            }
        }
    }

    KeyboardPanel {
        id: popup
        anchorItem: button
        owner: root
        bar: root.bar
        open: root.popupOpen
        contentWidth: popup.fittedContentWidth(Style.space(340))
        contentHeight: popup.fittedContentHeight(content.implicitHeight, Style.space(780))

        Flickable {
            id: panelScroll
            LayoutMirroring.enabled: strings.rightToLeft
            LayoutMirroring.childrenInherit: true
            anchors.fill: parent
            contentWidth: width
            contentHeight: content.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            flickableDirection: Flickable.VerticalFlick

            Controls.ScrollBar.vertical: Controls.ScrollBar {
                id: scrollBar
                policy: Controls.ScrollBar.AsNeeded
                visible: panelScroll.contentHeight > panelScroll.height
                hoverEnabled: true
                active: panelScroll.moving || hovered || pressed
                opacity: active ? 1 : 0
                z: 1
                x: strings.rightToLeft ? 0 : panelScroll.width - width
                width: Style.space(5)
                padding: 0
                Behavior on opacity {
                    NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic }
                }
                contentItem: Rectangle {
                    implicitWidth: Style.space(5)
                    radius: width / 2
                    color: Commons.Color.accent
                    opacity: scrollBar.pressed ? 1 : 0.55
                }
                background: null
            }

          Column {
            id: content
            width: panelScroll.contentWidth
            spacing: Style.spacing.panelGap

            Item {
                width: parent.width
                height: hero.implicitHeight

              Column {
                id: hero
                width: Math.max(1, parent.width - settingsButton.width * 2 - Style.space(8))
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: Style.space(4)

                PanelText {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: root.settingsVisible ? root.t("settings") : root.city ? root.city.name : root.t("title")
                    elide: Text.ElideRight
                    color: root.dim
                    font.pixelSize: Style.font.caption
                }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: Style.space(9)

                    PanelText {
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.t("title")
                        font.pixelSize: Style.font.heading
                        font.weight: Font.DemiBold
                    }
                    OpticalGlyph {
                        width: Math.round(Style.font.display * 1.3)
                        height: width
                        text: ""
                        fontFamily: root.contentFont
                        fontSize: Style.font.display
                        color: root.foreground
                    }
                }
              }
              PanelActionButton {
                id: settingsButton
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                iconText: root.settingsVisible ? (strings.rightToLeft ? "󰅂" : "󰅁") : "󰒓"
                tooltipText: root.settingsVisible ? root.t("back") : root.t("settings")
                enabled: !!root.city
                focusable: true
                foreground: root.foreground
                hoverColor: Commons.Color.accent
                fontFamily: root.contentFont
                onClicked: root.toggleSettings()
              }
            }

            CardDropdown {
                id: citySelector
                width: parent.width
                label: root.t("city")
                visible: !root.settingsVisible && root.cities.length > 1
                value: root.selectedCityKey
                options: root.cities.map(function(city) { return { value: Model.cityKey(city), label: city.name }; })
                fontFamily: root.contentFont
                onChanged: function(value) { root.activateCity(value); }
            }

            Column {
                width: parent.width
                visible: root.settingsVisible && root.cities.length > 0
                spacing: Style.spacing.md

                PanelText {
                    width: parent.width
                    text: root.t("cities.saved")
                    color: root.dim
                }
                Repeater {
                    model: root.cities
                    delegate: Rectangle {
                        id: savedCityCard
                        required property var modelData
                        readonly property string cityKey: Model.cityKey(modelData)
                        readonly property bool selected: cityKey === root.selectedCityKey
                        width: parent.width
                        height: Style.space(72)
                        radius: Style.cornerRadius
                        color: Qt.tint(Commons.Color.popups.background, Util.alpha(root.foreground, selected ? 0.10 : 0.055))

                        Item {
                            anchors.left: parent.left
                            anchors.right: removeCityButton.left
                            anchors.leftMargin: Style.spacing.rowPaddingX
                            anchors.rightMargin: Style.space(6)
                            height: parent.height
                            activeFocusOnTab: true
                            Keys.onReturnPressed: root.activateCity(savedCityCard.cityKey)
                            Keys.onSpacePressed: root.activateCity(savedCityCard.cityKey)
                            TapHandler { onTapped: root.activateCity(savedCityCard.cityKey) }
                            HoverHandler { cursorShape: Qt.PointingHandCursor }
                            Column {
                                width: parent.width
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(3)
                                PanelText {
                                    width: parent.width
                                    elide: Text.ElideRight
                                    text: savedCityCard.modelData.name
                                    color: savedCityCard.selected ? Commons.Color.accent : root.foreground
                                    font.pixelSize: Style.font.heading
                                    font.weight: Font.DemiBold
                                }
                                PanelText {
                                    width: parent.width
                                    elide: Text.ElideRight
                                    text: Model.cityDetails(savedCityCard.modelData)
                                    color: root.dim
                                    font.pixelSize: Style.font.caption
                                }
                            }
                        }
                        PanelActionButton {
                            id: removeCityButton
                            anchors.right: parent.right
                            anchors.rightMargin: Style.space(8)
                            anchors.verticalCenter: parent.verticalCenter
                            iconText: "󰆴"
                            tooltipText: root.t("cities.remove")
                            foreground: root.dim
                            hoverColor: root.bar ? root.bar.urgent : Commons.Color.accent
                            fontFamily: root.contentFont
                            focusable: true
                            onClicked: root.removeCity(savedCityCard.cityKey)
                        }
                    }
                }
                CardButton {
                    width: parent.width
                    text: root.editingCity ? root.t("search.cancel") : root.t("cities.add")
                    iconText: root.editingCity ? "" : "+"
                    focusable: true
                    enabled: root.editingCity || root.cities.length < Model.MAX_CITIES
                    fontFamily: root.contentFont
                    onClicked: {
                        root.editingCity = !root.editingCity;
                        if (root.editingCity) Qt.callLater(function() { cityField.forceActiveFocus(); });
                    }
                }
            }

            Column {
                width: parent.width
                visible: root.selectingCity
                spacing: Style.spacing.md

                TextField {
                    id: cityField
                    width: parent.width
                    placeholderText: root.t("search.placeholder")
                    maximumLength: 120
                    enabled: !citySearchProcess.running
                    font.family: root.contentFont
                    font.pixelSize: Style.font.heading
                    implicitHeight: Style.space(54)
                    background: Rectangle {
                        radius: Style.cornerRadius
                        color: Qt.tint(Commons.Color.popups.background, Util.alpha(root.foreground, 0.055))
                        border.width: cityField.activeFocus ? Style.spacing.hairline : 0
                        border.color: Commons.Color.accent
                    }
                    onAccepted: root.searchCities()
                    onTextChanged: { root.cityResults = []; root.citySearchError = ""; }
                }
                CardButton {
                    width: parent.width
                    text: citySearchProcess.running ? root.t("search.loading") : root.t("search.action")
                    enabled: !citySearchProcess.running && cityField.text.trim().length >= 2
                    fontFamily: root.contentFont
                    onClicked: root.searchCities()
                }
                PanelText {
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: root.citySearchError ? root.t(root.citySearchError) : root.t("search.privacy")
                    color: root.dim
                    font.pixelSize: Style.font.caption
                }
                Repeater {
                    model: root.cityResults
                    delegate: Rectangle {
                        required property var modelData
                        width: parent.width
                        height: cityResult.implicitHeight + Style.space(20)
                        radius: Style.cornerRadius
                        activeFocusOnTab: true
                        color: Qt.tint(Commons.Color.popups.background,
                            Util.alpha(root.foreground, activeFocus || resultHover.hovered ? 0.085 : 0.055))
                        Keys.onReturnPressed: root.selectCity(modelData)
                        Keys.onSpacePressed: root.selectCity(modelData)
                        HoverHandler { id: resultHover; cursorShape: Qt.PointingHandCursor }
                        PanelText {
                            id: cityResult
                            anchors.fill: parent
                            anchors.margins: Style.space(10)
                            verticalAlignment: Text.AlignVCenter
                            elide: Text.ElideRight
                            text: Model.cityLabel(modelData)
                            font.pixelSize: Style.font.body
                        }
                        TapHandler { onTapped: root.selectCity(modelData) }
                    }
                }
            }
            Column {
                width: parent.width
                visible: !!root.city
                spacing: Style.space(3)
                PanelText {
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: root.t(root.statusKey)
                    color: root.refreshFailed ? (root.bar ? root.bar.urgent : Commons.Color.accent) : root.dim
                }
                PanelText {
                    width: parent.width
                    visible: root.lastUpdatedAt > 0 || !!root.schedule
                    wrapMode: Text.Wrap
                    text: root.lastUpdatedAt > 0
                        ? root.t("status.updated").arg(strings.formatDateTime(root.lastUpdatedAt))
                        : root.t("status.updatedUnknown")
                    color: root.dim
                    font.pixelSize: Style.font.caption
                }
            }
            PanelText {
                width: parent.width
                wrapMode: Text.Wrap
                visible: root.error !== ""
                text: root.t(root.error)
                color: root.bar ? root.bar.urgent : Commons.Color.accent
            }
            Column {
              width: parent.width
              visible: !root.settingsVisible
              spacing: Style.spacing.md

              Repeater {
                model: root.timings ? Model.PRAYER_ORDER : []
                delegate: Rectangle {
                    id: prayerCard
                    required property string modelData
                    readonly property bool isNext: root.nextPrayer && root.nextPrayer.key === modelData
                    readonly property bool tomorrow: isNext && root.nextPrayer.tomorrow === true
                    readonly property string wallTime: tomorrow && root.nextPrayer
                        ? root.nextPrayer.time : root.timings ? root.timings[modelData] : ""
                    readonly property real scheduled: Model.dayFraction(wallTime)
                    width: parent.width
                    height: Style.space(72)
                    radius: Style.cornerRadius
                    color: Qt.tint(Commons.Color.popups.background,
                        Util.alpha(root.foreground, isNext ? 0.10 : cardHover.hovered ? 0.085 : 0.055))

                    HoverHandler { id: cardHover }

                    Item {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: Style.spacing.rowPaddingX
                        height: prayerTime.implicitHeight

                      PanelText {
                        id: prayerName
                        anchors.left: parent.left
                        anchors.right: prayerTime.left
                        anchors.rightMargin: Style.space(12)
                        anchors.baseline: prayerTime.baseline
                        elide: Text.ElideRight
                        text: root.t(prayerCard.modelData)
                        color: prayerCard.isNext ? Commons.Color.accent : root.foreground
                        font.pixelSize: Style.font.heading
                        font.weight: Font.DemiBold
                      }
                      PanelText {
                        id: prayerTime
                        anchors.right: parent.right
                        text: strings.formatTime(prayerCard.wallTime, root.clock12)
                        font.pixelSize: Style.font.heading
                        font.weight: Font.DemiBold
                      }
                    }

                    PanelText {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.leftMargin: Style.spacing.rowPaddingX
                        anchors.rightMargin: Style.spacing.rowPaddingX
                        y: Style.space(35)
                        text: prayerCard.isNext
                            ? (prayerCard.tomorrow ? root.t("countdown.tomorrow").arg(root.countdownLabel(root.nextPrayer, root.now)) : root.countdownLabel(root.nextPrayer, root.now))
                            : root.t(prayerCard.modelData === "Sunrise" ? "sunrise.description" : "today")
                        elide: Text.ElideRight
                        color: prayerCard.isNext ? root.dim : Qt.darker(root.foreground, 2.1)
                        font.pixelSize: Style.font.caption
                    }

                    Rectangle {
                        id: dayTrack
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        anchors.leftMargin: Style.spacing.rowPaddingX
                        anchors.rightMargin: Style.spacing.rowPaddingX
                        anchors.bottomMargin: Style.space(12)
                        height: Math.max(2, Style.space(3))
                        radius: height / 2
                        color: Util.alpha(root.foreground, 0.10)

                        Rectangle {
                            readonly property real sunrise: Model.dayFraction(root.timings ? root.timings.Sunrise : "")
                            readonly property real sunset: Model.dayFraction(root.timings ? root.timings.Maghrib : "")
                            x: parent.width * (LayoutMirroring.enabled ? 1 - sunset : sunrise)
                            width: parent.width * Math.max(0, sunset - sunrise)
                            height: parent.height
                            radius: parent.radius
                            color: Util.alpha(root.foreground, 0.20)
                        }
                        Rectangle {
                            width: Style.space(7)
                            height: width
                            radius: width / 2
                            anchors.verticalCenter: parent.verticalCenter
                            x: (parent.width - width) * (LayoutMirroring.enabled ? 1 - prayerCard.scheduled : prayerCard.scheduled)
                            color: prayerCard.isNext ? Commons.Color.accent : Qt.darker(root.foreground, 1.5)
                        }
                    }
                }
              }
            }

            Column {
              width: parent.width
              visible: root.settingsVisible
              spacing: Style.spacing.md

               CardDropdown {
                id: languageSelector
                width: parent.width
                label: root.t("language")
                value: strings.preference
                options: strings.options
                fontFamily: root.contentFont
                onChanged: function(value) { root.persistSettings({ language: value }); }
              }
               CardDropdown {
                id: methodSelector
                width: parent.width
                label: root.t("method")
                value: String(root.calculationMethod)
                options: Model.CALCULATION_METHODS.map(function(method) { return { value: String(method), label: root.t("method." + method) }; })
                fontFamily: root.contentFont
                onChanged: function(value) { root.persistSettings({ calculationMethod: Model.normalizedMethod(value) }); }
              }
               CardToggle {
                width: parent.width
                label: root.t("automatic")
                description: root.t("automatic.description")
                checked: root.autoRefresh
                fontFamily: root.contentFont
                onClicked: root.persistSettings({ autoRefresh: !root.autoRefresh })
              }
               CardDropdown {
                id: schoolSelector
                width: parent.width
                label: root.t("asr.school")
                value: String(root.asrSchool)
                options: [
                    { value: "0", label: root.t("asr.standard") },
                    { value: "1", label: root.t("asr.hanafi") }
                ]
                fontFamily: root.contentFont
                onChanged: function(value) { root.persistSettings({ asrSchool: Model.normalizedSchool(value) }); }
              }
               CardToggle {
                width: parent.width
                label: root.t("bar.countdown")
                description: root.t("bar.countdown.description")
                checked: root.showCountdown
                fontFamily: root.contentFont
                onClicked: root.persistSettings({ showCountdown: !root.showCountdown })
              }
               CardToggle {
                width: parent.width
                label: root.t("clock12")
                description: root.clock12 ? root.t("clock12.description") : root.t("clock24.description")
                checked: root.clock12
                fontFamily: root.contentFont
                onClicked: root.persistSettings({
                    clock12: !root.clock12
                })
              }
               CardButton {
                width: parent.width
                text: fetchProcess.running ? root.t("refresh.loading") : root.t("refresh")
                focusable: true
                enabled: !!root.city && !fetchProcess.running
                fontFamily: root.contentFont
                onClicked: root.refresh(true)
              }
            }
          }
        }
    }
}
