var form = document.getElementById("subForm");

if (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var emailInput = document.getElementById("subEmail");
    var message = document.getElementById("subMsg");
    var email = emailInput ? emailInput.value : "";

    message.className = "msg";
    message.textContent = "Sending...";

    fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("subscription failed");
        message.className = "msg ok";
        message.textContent = "You're on the list.";
        form.reset();
      })
      .catch(function () {
        message.textContent = "Something broke. Try again?";
      });
  });
}
