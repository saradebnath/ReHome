//store saved item variable from text box
let savedItem = "";
document.getElementById("addButton").addEventListener("click", function() {
    savedItem = document.getElementById("itemInput").value;
    console.log("Current item: " + savedItem);
});
//item condition checker
function checkCondition() {
    const form = document.getElementById("itemForm");
    const data= new FormData(form);
    const itemStatus = data.get("condition");
    console.log("Condition is: " + itemStatus);
}