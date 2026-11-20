import QtQml
import "../../AlertDelivery.js" as Delivery

QtObject {
    function claim(event, now) { return Delivery.claim(event, now); }
}
