const express = require("express");
const dotenv = require("dotenv")
const bodyParser = require("body-parser");
const mongoose = require("mongoose")
const connectDB = require("./config/db")
dotenv.config({ path: 'config.env'})
connectDB()


const paymentSchema = new mongoose.Schema({
    paymentNumber: Number,
    remainingBalance: Number,
    paymentDate : String
});

const loanSchema = new mongoose.Schema({
    name: String,
    amount: Number,
    rate: Number,
    term: Number,
    firstPaymentDate: String,
    lastPaymentDate: String,
    monthlyPayment: Number,
    totalInterest: Number,
    payments: [paymentSchema]
});

const Loan = mongoose.model("Loan", loanSchema);

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

const months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

const colors = [
    "#FF5768", "#00A5E3", "#4DD091", "#FFEC59",
    "#FF60A8", "#1DEEE1", "#8BFF1E", "#534FF2",
    "#FBFB02", "#FE7303", "#F80300", "#1DEEE1"
]


app.get("/", (req, res)=> {

    let year = new Date().getFullYear();

    res.render("loan", {monthArray: months, yearSelect: year});
});

app.post("/", async(req, res)=> {
    try{
        let name = req.body.loanName
        let startingBalance = req.body.loanAmount
        let principal = req.body.loanAmount
        let rate = req.body.interestRate/100
        let term = req.body.term
        let monthlyRate = rate/12
        let monthlyPayment = (principal*monthlyRate)*(Math.pow(1+monthlyRate, term))/(Math.pow((1+monthlyRate), term)-1)
        console.log(monthlyPayment);
        let monthInput = months.indexOf(req.body.month)
        let yearInput = req.body.year
        let startDate = new Date(yearInput, monthInput)
        
        let fixedPayment = monthlyPayment.toFixed(2)
        let interestArray = []
        let dbPayments = []
        let i = 0


        while (principal > 0) {
            principalPmt = (fixedPayment - ((principal*(rate/12))).toFixed(2)).toFixed(2)
            interestPmt = fixedPayment - principalPmt
            principal -= principalPmt
            monthlyPaymentDate = new Date(yearInput, monthInput + i)
            monthlyPaymentDateString = monthlyPaymentDate.toLocaleString('en-US', {month: 'short', year: 'numeric'})
            interestArray.push(interestPmt) 
            i++
            if ((principal - principalPmt) > 0) {
                let payment = {
                    paymentNumber: i,
                    remainingBalance: principal,
                    paymentDate: monthlyPaymentDate}

                dbPayments.push(payment);

            } else {
                principal -= principal
                let payment = {
                    paymentNumber: i,
                    remainingBalance: principal,
                    paymentDate: monthlyPaymentDate}

                dbPayments.push(payment);
            }
                
            };
                
        let totalInterest = interestArray.reduce((total, current) => (total + current), 0)
    
        const loan = new Loan ({
            name: name,
            amount: startingBalance,
            rate: rate,
            term: term,
            totalInterest: totalInterest,
            firstPaymentDate: startDate,
            lastPaymentDate: dbPayments[(term-1)].paymentDate,
            monthlyPayment: monthlyPayment,
            payments: dbPayments
        });
        
        await loan.save();    
        
        res.redirect("/chart");
    } catch(err) {
        console.log(err);
    }
    

});




app.get("/chart", async(req, res)=> {

try{
latestDate = [];
dateFilter = [];
dateAxis = [];
maxDateVar = [];

const dbLoan =  await Loan.find({}, { _id: 0, lastPaymentDate: 1})

    for (let i=0; i<dbLoan.length; i++) {
        let dateFull = new Date(dbLoan[i].lastPaymentDate)
        latestDate.push(dateFull)
    }
    
    let maxDate = new Date(Math.max.apply(null,latestDate));
    let maxDateShort = maxDate.toLocaleString('en-US', {month: 'short', year: 'numeric'})
    maxDateVar.push(maxDateShort)
    let today = new Date();
    let year1 = today.getFullYear();
    let year2 = maxDate.getFullYear();
    let month1 = today.getMonth();
    let month2 = maxDate.getMonth();
    if(month1===0){
        month1++
        month2++
    }
    let dateDiff=(year2 - year1) * 12 + (month2 - month1) -1

    let currentMonth = today.getMonth();
    let currentYear = today.getFullYear();


    for (let i=0; i<dateDiff+2; i++) {
        let rawDate = new Date(currentYear, currentMonth + i)
        let dateLabel = rawDate.toString()
        let dateLabelString = rawDate.toLocaleString('en-US', {month: 'short', year: 'numeric'});
        dateFilter.push(dateLabel)
        dateAxis.push(dateLabelString)
    }

        const loanDocs = await Loan.aggregate([
            {$unwind: "$payments"},
            {$match: {"payments.paymentDate": {$in: dateFilter}}},
            {$group: {
                _id: {
                    name: "$name",
                    amount: "$amount",
                    rate: "$rate",
                    lastPaymentDate: "$lastPaymentDate",
                    totalInterest: "$totalInterest",
                    _id: "$_id"
                },
                "payments" :{
                    $push: "$payments.remainingBalance"
                }
            }},
            {$sort: {["payments"]: -1}},
            
        ])

        const paymentArray = loanDocs

        let amountPaid = 0
        let interestPaid = 0
        let payoffDate = []

        for (let i=0; i<paymentArray.length; i++) {
            amountPaid += paymentArray[i]._id.amount
            interestPaid += paymentArray[i]._id.totalInterest
            payoffDate.push(paymentArray[i]._id.lastPaymentDate)
        }

    let totalCost = amountPaid + interestPaid
        console.log(dateFilter);
    res.render("chart", {dateArray: dateAxis, loanArray: paymentArray, colorArray: colors, interestPaidSum: interestPaid, totalCostSum: totalCost, debtFreeDate: maxDateVar});
    
    } catch (err) {
        console.log(err);
    }
        
})

app.post("/chart", (req, res) => {
    res.redirect("/")
});

app.get('/delete/(:id)', async(req, res) => {
    try{
        await Loan.findByIdAndRemove(req.params.id)
        console.log("Deleted loan");
        res.redirect("/chart")
    } catch(err) {
        console.log(err);
    }
});

app.listen(process.env.PORT || 3000, ()=> {
    console.log("server started on port 3000");
    
});